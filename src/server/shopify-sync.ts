import { dollarsToCents } from "@/lib/format";
import { laterBarcode, parseSsSku } from "@/lib/identifiers";
import { shopifyConfigured } from "@/lib/env";
import { prisma } from "@/lib/db";
import { shopifyGraphql } from "@/lib/shopify/client";
import { LOCATIONS_QUERY, ORDERS_QUERY, PRODUCTS_QUERY } from "@/lib/shopify/queries";

type MetafieldValue = { value?: string | null } | null;

type RemoteLevel = {
  location: { id: string; name: string };
  quantities: { name: string; quantity: number }[];
};

type RemoteVariant = {
  id: string;
  title: string;
  sku?: string | null;
  barcode?: string | null;
  price?: string | null;
  inventoryItem?: {
    id: string;
    unitCost?: { amount?: string | null } | null;
    inventoryLevels?: { nodes: RemoteLevel[] };
  } | null;
  ssSku?: MetafieldValue;
  ssBarcode?: MetafieldValue;
  barcodes?: { nodes: { value: string }[] } | null;
};

type RemoteProduct = {
  id: string;
  title: string;
  description?: string | null;
  status?: string | null;
  vendor?: string | null;
  variants: { nodes: RemoteVariant[] };
  brand?: MetafieldValue;
  texture?: MetafieldValue;
  season?: MetafieldValue;
  size?: MetafieldValue;
  material?: MetafieldValue;
  ageGuidance?: MetafieldValue;
  newArrival?: MetafieldValue;
  receivedAt?: MetafieldValue;
};

type IncomingLine = {
  shopifyLineId: string;
  shopifyVariantId: string | null;
  title: string;
  sku: string;
  qty: number;
  unitPriceCents: number;
};

type IncomingRefund = {
  shopifyRefundId: string;
  processedAt: string;
  lines: { shopifyLineId: string; shopifyVariantId: string | null; title: string; qty: number; amountCents: number }[];
};

type IncomingOrder = {
  shopifyOrderId: string;
  name: string;
  sourceName: string;
  locationName: string;
  processedAt: string;
  financialStatus: string;
  cancelled: boolean;
  lines: IncomingLine[];
  refunds: IncomingRefund[];
};

function meta(field: MetafieldValue | undefined) {
  return field?.value?.trim() || "";
}

function centsFromAmount(amount: unknown) {
  if (typeof amount === "number" && Number.isFinite(amount)) return dollarsToCents(amount.toFixed(2)) ?? 0;
  if (typeof amount === "string") return dollarsToCents(amount) ?? 0;
  return 0;
}

function numericId(value: string | number | null | undefined) {
  if (value == null) return "";
  return String(value).split("/").pop() || "";
}

function variantGid(value: string | number | null | undefined) {
  const numeric = numericId(value);
  return numeric ? `gid://shopify/ProductVariant/${numeric}` : "";
}

function inventoryGid(value: string | number | null | undefined) {
  const numeric = numericId(value);
  return numeric ? `gid://shopify/InventoryItem/${numeric}` : "";
}

function locationGid(value: string | number | null | undefined) {
  const numeric = numericId(value);
  return numeric ? `gid://shopify/Location/${numeric}` : "";
}

export function channelForOrder(sourceName: string | null | undefined, locationName: string | null | undefined) {
  const source = (sourceName || "").toLowerCase();
  const location = (locationName || "").toLowerCase();
  if (source === "pos" || location.includes("squishy")) return "pos";
  return "online";
}

function channelForLocation(name: string) {
  return /squishy/i.test(name) ? "pos" : "online";
}

async function setting(key: string) {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value || "";
}

async function putSetting(key: string, value: string) {
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

async function ensureLocation(shopifyId: string, name: string) {
  const gid = locationGid(shopifyId);
  const existing = await prisma.location.findFirst({
    where: { OR: [{ shopifyLocationId: gid }, { shopifyLocationId: numericId(shopifyId) }, { shopifyLocationId: shopifyId }] },
  });
  if (existing) {
    if (name && (existing.name.startsWith("Shopify location") || existing.shopifyLocationId !== gid)) {
      return prisma.location.update({
        where: { id: existing.id },
        data: { name, shopifyLocationId: gid, channel: channelForLocation(name) },
      });
    }
    return existing;
  }
  return prisma.location.create({
    data: {
      name: name || `Shopify location ${numericId(shopifyId)}`,
      channel: channelForLocation(name),
      shopifyLocationId: gid,
      isDefaultReceive: /squishy/i.test(name),
    },
  });
}

async function findVariant(shopifyVariantId: string | null, sku: string) {
  if (shopifyVariantId) {
    const gid = variantGid(shopifyVariantId);
    const numeric = numericId(shopifyVariantId);
    const found = await prisma.variant.findFirst({
      where: { OR: [{ shopifyVariantId: gid }, { shopifyVariantId: numeric }, { shopifyVariantId }] },
    });
    if (found) return found;
  }
  if (sku) {
    return prisma.variant.findFirst({ where: { OR: [{ vendorSku: sku }, { ssSku: sku.toUpperCase() }, { ssSku: sku }] } });
  }
  return null;
}

function vendorBarcodes(variant: RemoteVariant) {
  const fromList = variant.barcodes?.nodes?.map((node) => node.value).filter(Boolean) ?? [];
  const first = fromList[0] || variant.barcode || "";
  const extras = fromList.slice(first && fromList[0] === first ? 1 : 0).filter((value) => value !== first);
  return { vendorBarcode: first, otherBarcodes: extras.length ? `,${extras.join(",")},` : "" };
}

async function applyStock(variantId: string, levels: RemoteLevel[]) {
  for (const level of levels) {
    const available = level.quantities.find((quantity) => quantity.name === "available")?.quantity ?? 0;
    const location = await ensureLocation(level.location.id, level.location.name);
    await prisma.stockLevel.upsert({
      where: { variantId_locationId: { variantId, locationId: location.id } },
      update: { available },
      create: { variantId, locationId: location.id, available },
    });
  }
}

async function upsertRemoteProduct(product: RemoteProduct) {
  const existing = await prisma.product.findUnique({
    where: { shopifyProductId: product.id },
    include: { variants: true },
  });
  const status = (product.status || "ACTIVE").toLowerCase();
  if (!existing) {
    const category = parseSsSku(meta(product.variants.nodes[0]?.ssSku))?.category || "";
    const created = await prisma.product.create({
      data: {
        title: product.title,
        description: product.description || "",
        status: status === "active" || status === "draft" || status === "archived" ? status : "active",
        shopifyProductId: product.id,
        brand: meta(product.brand) || product.vendor || "",
        texture: meta(product.texture),
        season: meta(product.season),
        size: meta(product.size),
        material: meta(product.material),
        ageGuidance: meta(product.ageGuidance),
        newArrival: meta(product.newArrival) === "true",
        receivedAt: meta(product.receivedAt) ? new Date(`${meta(product.receivedAt)}T12:00:00Z`) : null,
        categoryCode: category,
      },
    });
    for (const [index, variant] of product.variants.nodes.entries()) {
      await createVariantFromRemote(created.id, variant, index);
    }
    return "created";
  }

  for (const [index, remote] of product.variants.nodes.entries()) {
    const local = existing.variants.find((variant) => variant.shopifyVariantId === remote.id);
    const codes = vendorBarcodes(remote);
    if (!local) {
      await createVariantFromRemote(existing.id, remote, index);
      continue;
    }
    await prisma.variant.update({
      where: { id: local.id },
      data: {
        vendorSku: remote.sku || local.vendorSku,
        vendorBarcode: codes.vendorBarcode || local.vendorBarcode,
        otherBarcodes: codes.otherBarcodes || local.otherBarcodes,
        shopifyInventoryItemId: remote.inventoryItem?.id || local.shopifyInventoryItemId,
        ssSku: local.ssSku || meta(remote.ssSku),
        ssBarcode: local.ssBarcode || meta(remote.ssBarcode),
      },
    });
    if (remote.inventoryItem?.inventoryLevels?.nodes) {
      await applyStock(local.id, remote.inventoryItem.inventoryLevels.nodes);
    }
  }
  return "updated";
}

async function createVariantFromRemote(productId: string, variant: RemoteVariant, position: number) {
  const codes = vendorBarcodes(variant);
  const parsed = parseSsSku(meta(variant.ssSku));
  const created = await prisma.variant.create({
    data: {
      productId,
      title: variant.title || "Default",
      variantCode: parsed?.variantCode || "STD",
      vendorSku: variant.sku || "",
      vendorBarcode: codes.vendorBarcode,
      otherBarcodes: codes.otherBarcodes,
      ssSku: meta(variant.ssSku),
      ssBarcode: meta(variant.ssBarcode),
      priceCents: centsFromAmount(variant.price),
      costCents: variant.inventoryItem?.unitCost?.amount ? centsFromAmount(variant.inventoryItem.unitCost.amount) : null,
      shopifyVariantId: variant.id,
      shopifyInventoryItemId: variant.inventoryItem?.id || null,
      position,
    },
  });
  if (variant.inventoryItem?.inventoryLevels?.nodes) {
    await applyStock(created.id, variant.inventoryItem.inventoryLevels.nodes);
  }
  if (created.ssBarcode) {
    const counter = await prisma.barcodeCounter.findUnique({ where: { id: "series" } });
    const next = laterBarcode(counter?.lastIssued || created.ssBarcode, created.ssBarcode);
    await prisma.barcodeCounter.upsert({
      where: { id: "series" },
      update: { lastIssued: next },
      create: { id: "series", lastIssued: next },
    });
  }
}

async function rememberOrder(order: IncomingOrder) {
  const existing = await prisma.saleOrder.findUnique({
    where: { shopifyOrderId: order.shopifyOrderId },
    include: { lines: true, refunds: true },
  });
  const channel = channelForOrder(order.sourceName, order.locationName);
  if (!existing) {
    const created = await prisma.saleOrder.create({
      data: {
        shopifyOrderId: order.shopifyOrderId,
        name: order.name,
        channel,
        locationName: order.locationName,
        processedAt: new Date(order.processedAt),
        financialStatus: order.financialStatus,
        cancelled: order.cancelled,
      },
    });
    for (const line of order.lines) {
      const variant = await findVariant(line.shopifyVariantId, line.sku);
      await prisma.saleLine.create({
        data: {
          orderId: created.id,
          shopifyLineId: line.shopifyLineId,
          variantId: variant?.id,
          title: line.title,
          sku: line.sku,
          qty: line.qty,
          unitPriceCents: line.unitPriceCents,
          unitCostCents: variant?.costCents ?? null,
        },
      });
    }
    for (const refund of order.refunds) await rememberRefund(created.id, refund);
    return "created";
  }
  await prisma.saleOrder.update({
    where: { id: existing.id },
    data: {
      financialStatus: order.financialStatus || existing.financialStatus,
      cancelled: order.cancelled,
      channel,
      locationName: order.locationName || existing.locationName,
    },
  });
  for (const refund of order.refunds) {
    if (!existing.refunds.some((row) => row.shopifyRefundId === refund.shopifyRefundId)) {
      await rememberRefund(existing.id, refund);
    }
  }
  return "updated";
}

async function rememberRefund(orderId: string, refund: IncomingRefund) {
  const orderLines = await prisma.saleLine.findMany({ where: { orderId } });
  await prisma.refund.create({
    data: {
      orderId,
      shopifyRefundId: refund.shopifyRefundId,
      processedAt: new Date(refund.processedAt),
      lines: {
        create: await Promise.all(
          refund.lines.map(async (line) => {
            const variant = await findVariant(line.shopifyVariantId, "");
            const saleLine = orderLines.find((row) => row.shopifyLineId && row.shopifyLineId === line.shopifyLineId);
            return {
              variantId: variant?.id || saleLine?.variantId,
              title: line.title,
              qty: line.qty,
              amountCents: line.amountCents,
              unitCostCents: saleLine?.unitCostCents ?? variant?.costCents ?? null,
            };
          }),
        ),
      },
    },
  });
}

function graphqlOrder(node: {
  id: string;
  name: string;
  sourceName?: string | null;
  processedAt?: string | null;
  displayFinancialStatus?: string | null;
  cancelledAt?: string | null;
  retailLocation?: { name?: string | null } | null;
  lineItems: { nodes: { id: string; title: string; sku?: string | null; quantity: number; originalUnitPriceSet?: { shopMoney?: { amount?: string } }; variant?: { id?: string | null } | null }[] };
  refunds: { id: string; createdAt: string; refundLineItems: { nodes: { quantity: number; subtotalSet?: { shopMoney?: { amount?: string } }; lineItem?: { id?: string; title?: string; sku?: string | null; variant?: { id?: string | null } | null } | null }[] } }[];
}): IncomingOrder {
  return {
    shopifyOrderId: numericId(node.id),
    name: node.name,
    sourceName: node.sourceName || "",
    locationName: node.retailLocation?.name || "",
    processedAt: node.processedAt || new Date().toISOString(),
    financialStatus: (node.displayFinancialStatus || "").toLowerCase(),
    cancelled: Boolean(node.cancelledAt),
    lines: node.lineItems.nodes.map((line) => ({
      shopifyLineId: numericId(line.id),
      shopifyVariantId: line.variant?.id || null,
      title: line.title,
      sku: line.sku || "",
      qty: line.quantity,
      unitPriceCents: centsFromAmount(line.originalUnitPriceSet?.shopMoney?.amount),
    })),
    refunds: node.refunds.map((refund) => ({
      shopifyRefundId: numericId(refund.id),
      processedAt: refund.createdAt,
      lines: refund.refundLineItems.nodes.map((line) => ({
        shopifyLineId: numericId(line.lineItem?.id),
        shopifyVariantId: line.lineItem?.variant?.id || null,
        title: line.lineItem?.title || "Refund",
        qty: line.quantity,
        amountCents: centsFromAmount(line.subtotalSet?.shopMoney?.amount),
      })),
    })),
  };
}

export async function importFromShopify() {
  if (!shopifyConfigured()) {
    return { status: "skipped", detail: "Add the Shopify admin token before importing the live catalog." };
  }
  const run = await prisma.syncRun.create({ data: { kind: "shopify_import", status: "running", detail: "Starting import" } });
  try {
    await importLocations();
    const products = await importProductPages(null, null);
    const orders = await importOrderPages(null, null);
    const detail = `Imported ${products} product pages and ${orders} order pages from Shopify.`;
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "ok", detail, finishedAt: new Date() } });
    return { status: "ok", detail };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Import failed.";
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "error", detail, finishedAt: new Date() } });
    return { status: "error", detail };
  }
}

async function importLocations() {
  const data = await shopifyGraphql<{ locations: { nodes: { id: string; name: string; isActive: boolean }[] } }>(LOCATIONS_QUERY);
  for (const location of data.locations.nodes) {
    if (location.isActive) await ensureLocation(location.id, location.name);
  }
}

async function importProductPages(cursor: string | null, search: string | null) {
  let page = 0;
  let after = cursor;
  while (page < 10) {
    const data = await shopifyGraphql<{
      products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RemoteProduct[] };
    }>(PRODUCTS_QUERY, { cursor: after, search });
    for (const product of data.products.nodes) await upsertRemoteProduct(product);
    page += 1;
    if (!data.products.pageInfo.hasNextPage) {
      await putSetting("product_cursor", "");
      await putSetting("product_synced_at", new Date().toISOString());
      break;
    }
    after = data.products.pageInfo.endCursor;
    await putSetting("product_cursor", after || "");
  }
  return page;
}

async function importOrderPages(cursor: string | null, search: string | null) {
  let page = 0;
  let after = cursor;
  while (page < 10) {
    const data = await shopifyGraphql<{
      orders: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Parameters<typeof graphqlOrder>[0][];
      };
    }>(ORDERS_QUERY, { cursor: after, search });
    for (const order of data.orders.nodes) await rememberOrder(graphqlOrder(order));
    page += 1;
    if (!data.orders.pageInfo.hasNextPage) {
      await putSetting("order_cursor", "");
      await putSetting("order_synced_at", new Date().toISOString());
      break;
    }
    after = data.orders.pageInfo.endCursor;
    await putSetting("order_cursor", after || "");
  }
  return page;
}

export async function reconcile(trigger: string) {
  const run = await prisma.syncRun.create({ data: { kind: "reconcile", status: "running", detail: trigger } });
  if (!shopifyConfigured()) {
    const detail = "Demo mode: Shopify token is not set, so reconcile did not call the shop.";
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "skipped", detail, finishedAt: new Date() } });
    return { status: "skipped", detail };
  }
  try {
    await importLocations();
    const productCursor = await setting("product_cursor");
    const productSince = await setting("product_synced_at");
    const products = await importProductPages(productCursor || null, productCursor ? null : productSince ? `updated_at:>='${productSince}'` : null);
    const orderCursor = await setting("order_cursor");
    const orderSince = await setting("order_synced_at");
    const orders = await importOrderPages(orderCursor || null, orderCursor ? null : orderSince ? `updated_at:>='${orderSince}'` : null);
    const detail = `Reconciled ${products} product page(s) and ${orders} order page(s).`;
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "ok", detail, finishedAt: new Date() } });
    return { status: "ok", detail };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Reconcile failed.";
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "error", detail, finishedAt: new Date() } });
    return { status: "error", detail };
  }
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function handleWebhook(topic: string, body: unknown, webhookId: string) {
  if (webhookId) {
    const seen = await prisma.webhookEvent.findUnique({ where: { webhookId } });
    if (seen) return;
  }
  try {
    let detail = "Applied.";
    if (topic === "orders/create" || topic === "orders/paid") await rememberOrder(restOrder(asRecord(body)));
    else if (topic === "refunds/create") await restRefund(asRecord(body));
    else if (topic === "products/update") detail = await restProduct(asRecord(body));
    else if (topic === "inventory_levels/update") detail = await restInventory(asRecord(body));
    await prisma.webhookEvent.create({
      data: { webhookId: webhookId || null, topic, status: "ok", detail },
    });
  } catch (error) {
    await prisma.webhookEvent.create({
      data: {
        topic,
        status: "error",
        detail: error instanceof Error ? error.message : "Webhook failed.",
      },
    });
    throw error;
  }
}

function restOrder(body: Record<string, unknown>): IncomingOrder {
  const lines = Array.isArray(body.line_items) ? body.line_items.map(asRecord) : [];
  const refunds = Array.isArray(body.refunds) ? body.refunds.map(asRecord) : [];
  return {
    shopifyOrderId: numericId(body.id as string),
    name: String(body.name || `#${body.id}`),
    sourceName: String(body.source_name || ""),
    locationName: String(body.location_id || ""),
    processedAt: String(body.processed_at || body.created_at || new Date().toISOString()),
    financialStatus: String(body.financial_status || ""),
    cancelled: Boolean(body.cancelled_at),
    lines: lines.map((line) => ({
      shopifyLineId: numericId(line.id as string),
      shopifyVariantId: line.variant_id ? variantGid(line.variant_id as string) : null,
      title: String(line.title || "Item"),
      sku: String(line.sku || ""),
      qty: Number(line.quantity || 0),
      unitPriceCents: centsFromAmount(line.price),
    })),
    refunds: refunds.map((refund) => ({
      shopifyRefundId: numericId(refund.id as string),
      processedAt: String(refund.created_at || new Date().toISOString()),
      lines: (Array.isArray(refund.refund_line_items) ? refund.refund_line_items : []).map((item) => {
        const row = asRecord(item);
        const line = asRecord(row.line_item);
        return {
          shopifyLineId: numericId(line.id as string),
          shopifyVariantId: line.variant_id ? variantGid(line.variant_id as string) : null,
          title: String(line.title || "Refund"),
          qty: Number(row.quantity || 0),
          amountCents: centsFromAmount(row.subtotal),
        };
      }),
    })),
  };
}

async function restRefund(body: Record<string, unknown>) {
  const orderId = numericId(body.order_id as string);
  let order = await prisma.saleOrder.findUnique({ where: { shopifyOrderId: orderId } });
  if (!order) {
    order = await prisma.saleOrder.create({
      data: {
        shopifyOrderId: orderId,
        name: `Order ${orderId}`,
        channel: "online",
        processedAt: new Date(String(body.created_at || new Date().toISOString())),
        financialStatus: "refunded",
      },
    });
  }
  const refundId = numericId(body.id as string);
  const existing = await prisma.refund.findUnique({ where: { shopifyRefundId: refundId } });
  if (existing) return;
  await rememberRefund(order.id, {
    shopifyRefundId: refundId,
    processedAt: String(body.created_at || new Date().toISOString()),
    lines: (Array.isArray(body.refund_line_items) ? body.refund_line_items : []).map((item) => {
      const row = asRecord(item);
      const line = asRecord(row.line_item);
      return {
        shopifyLineId: numericId(line.id as string),
        shopifyVariantId: line.variant_id ? variantGid(line.variant_id as string) : null,
        title: String(line.title || "Refund"),
        qty: Number(row.quantity || 0),
        amountCents: centsFromAmount(row.subtotal),
      };
    }),
  });
}

async function restProduct(body: Record<string, unknown>) {
  const variants = Array.isArray(body.variants) ? body.variants.map(asRecord) : [];
  let touched = 0;
  for (const variant of variants) {
    const local = await findVariant(variantGid(variant.id as string), "");
    if (!local) continue;
    await prisma.variant.update({
      where: { id: local.id },
      data: {
        vendorSku: variant.sku == null ? local.vendorSku : String(variant.sku),
        vendorBarcode: variant.barcode == null ? local.vendorBarcode : String(variant.barcode),
        shopifyInventoryItemId: variant.inventory_item_id ? inventoryGid(variant.inventory_item_id as string) : local.shopifyInventoryItemId,
      },
    });
    touched += 1;
  }
  if (!touched) return "Product is not in S&S Software yet. Run a reconcile to import it.";
  return `Updated vendor identifiers on ${touched} variant(s). S&S SKUs and barcodes were left alone.`;
}

async function restInventory(body: Record<string, unknown>) {
  const inventoryId = inventoryGid(body.inventory_item_id as string);
  const variant = await prisma.variant.findFirst({
    where: {
      OR: [
        { shopifyInventoryItemId: inventoryId },
        { shopifyInventoryItemId: numericId(body.inventory_item_id as string) },
      ],
    },
  });
  if (!variant) return "Inventory item is not linked to a variant yet.";
  const location = await ensureLocation(String(body.location_id || ""), "");
  const available = Number(body.available ?? 0);
  await prisma.stockLevel.upsert({
    where: { variantId_locationId: { variantId: variant.id, locationId: location.id } },
    update: { available },
    create: { variantId: variant.id, locationId: location.id, available },
  });
  return `Stock cache set to ${available}. This did not write back to Shopify.`;
}
