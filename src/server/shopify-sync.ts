import { dollarsToCents } from "@/lib/format";
import { laterBarcode, parseSsSku, seriesMarkAfterImport } from "@/lib/identifiers";
import { isDemoProduct } from "@/lib/demo-fingerprint";
import { shopifyConfigured } from "@/lib/env";
import { prisma } from "@/lib/db";
import { shopifyGraphql } from "@/lib/shopify/client";
import { enqueueImport } from "@/server/label-queue";
import {
  INVENTORY_QUERY,
  LOCATIONS_QUERY,
  ORDERS_COUNT_QUERY,
  ORDER_LINES_QUERY,
  ORDERS_QUERY,
  PRODUCTS_COUNT_QUERY,
  PRODUCT_SHELLS_QUERY,
  VARIANTS_QUERY,
} from "@/lib/shopify/queries";

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
      await createVariantFromRemote(created.id, variant, index, meta(product.receivedAt));
    }
    return "created";
  }

  await prisma.product.update({
    where: { id: existing.id },
    data: {
      title: product.title,
      description: product.description || "",
      status: status === "active" || status === "draft" || status === "archived" ? status : existing.status,
      brand: meta(product.brand) || product.vendor || existing.brand,
      texture: meta(product.texture) || existing.texture,
      season: meta(product.season) || existing.season,
      size: meta(product.size) || existing.size,
      material: meta(product.material) || existing.material,
      ageGuidance: meta(product.ageGuidance) || existing.ageGuidance,
      newArrival: meta(product.newArrival) === "true" || existing.newArrival,
      receivedAt: meta(product.receivedAt) ? new Date(`${meta(product.receivedAt)}T12:00:00Z`) : existing.receivedAt,
      categoryCode: existing.categoryCode || parseSsSku(meta(product.variants.nodes[0]?.ssSku))?.category || "",
    },
  });

  for (const [index, remote] of product.variants.nodes.entries()) {
    const local = existing.variants.find((variant) => variant.shopifyVariantId === remote.id);
    const codes = vendorBarcodes(remote);
    if (!local) {
      await createVariantFromRemote(existing.id, remote, index, meta(product.receivedAt));
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

async function createVariantFromRemote(productId: string, variant: RemoteVariant, position: number, receivedOn: string) {
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
  const levels = await prisma.stockLevel.findMany({ where: { variantId: created.id } });
  const onHand = levels.reduce((sum, level) => sum + level.available, 0);
  await enqueueImport(created.id, receivedOn, onHand);
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
  lineItems: { pageInfo?: { hasNextPage: boolean; endCursor: string | null }; nodes: { id: string; title: string; sku?: string | null; quantity: number; originalUnitPriceSet?: { shopMoney?: { amount?: string } }; variant?: { id?: string | null } | null }[] };
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

const JOB_KEY = "shopify_import_job";

type ImportJob = {
  phase: "locations" | "products" | "orders" | "finish" | "done";
  locationCursor: string | null;
  productCursor: string | null;
  productPagesDone: boolean;
  pendingProductIds: string[];
  activeProductId: string | null;
  variantCursor: string | null;
  productsDone: number;
  productsTotal: number | null;
  orderCursor: string | null;
  ordersDone: number;
  ordersTotal: number | null;
  search: string | null;
  note: string;
};

export function describeImportProgress(job: Pick<ImportJob, "phase" | "productsDone" | "productsTotal" | "ordersDone" | "ordersTotal" | "note">) {
  if (job.phase === "done") return job.note || `Import finished. ${job.productsDone} products are in S&S Software.`;
  const products = job.productsTotal == null ? `Imported ${job.productsDone} products` : `Imported ${job.productsDone} of ${job.productsTotal} products`;
  if (job.phase === "orders") {
    const orders = job.ordersTotal == null ? `${job.ordersDone} orders` : `${job.ordersDone} of ${job.ordersTotal} orders`;
    return `${products}. Reading orders, ${orders}...`;
  }
  if (job.phase === "locations") return "Reading shop locations...";
  if (job.phase === "finish") return `${products}. Updating the barcode series...`;
  return `${products}...`;
}

function blankJob(search: string | null): ImportJob {
  return {
    phase: "locations",
    locationCursor: null,
    productCursor: null,
    productPagesDone: false,
    pendingProductIds: [],
    activeProductId: null,
    variantCursor: null,
    productsDone: 0,
    productsTotal: null,
    orderCursor: null,
    ordersDone: 0,
    ordersTotal: null,
    search,
    note: "",
  };
}

async function loadJob() {
  const raw = await setting(JOB_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImportJob;
  } catch {
    return null;
  }
}

async function saveJob(job: ImportJob) {
  await putSetting(JOB_KEY, JSON.stringify(job));
}

type Read = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

async function countOf(read: Read, query: string, search: string | null) {
  try {
    const data = await read<{ productsCount?: { count: number }; ordersCount?: { count: number } }>(query, { search });
    return data.productsCount?.count ?? data.ordersCount?.count ?? null;
  } catch {
    return null;
  }
}

async function importVariantPage(read: Read, productId: string, cursor: string | null) {
  const data = await read<{
    product: { variants: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RemoteVariant[] } } | null;
  }>(VARIANTS_QUERY, { id: productId, cursor });
  const page = data.product?.variants;
  if (!page) return { done: true as const };
  const local = await prisma.product.findUnique({ where: { shopifyProductId: productId } });
  if (local) {
    await upsertRemoteProduct({
      id: productId,
      title: local.title,
      description: local.description,
      status: local.status,
      variants: { nodes: page.nodes },
    });
  }
  const ids = page.nodes.map((variant) => variant.inventoryItem?.id).filter((id): id is string => Boolean(id));
  for (let start = 0; start < ids.length; start += 8) {
    const stock = await read<{ nodes: ({ id: string; inventoryLevels?: { nodes: RemoteLevel[] } } | null)[] }>(INVENTORY_QUERY, { ids: ids.slice(start, start + 8) });
    for (const item of stock.nodes) {
      if (!item?.id || !item.inventoryLevels?.nodes) continue;
      const variant = await prisma.variant.findFirst({ where: { shopifyInventoryItemId: item.id } });
      if (variant) await applyStock(variant.id, item.inventoryLevels.nodes);
    }
  }
  return page.pageInfo.hasNextPage ? { done: false as const, cursor: page.pageInfo.endCursor } : { done: true as const };
}

async function finishBarcodeSeries() {
  const products = await prisma.product.findMany({ include: { variants: true } });
  const shopifyBarcodes: string[] = [];
  const appIssued: string[] = [];
  for (const product of products) {
    const demo = product.demoSeed || isDemoProduct({
      title: product.title,
      shopifyProductId: product.shopifyProductId,
      demoSeed: product.demoSeed,
      skus: product.variants.map((variant) => variant.ssSku),
      shopifyVariantIds: product.variants.map((variant) => variant.shopifyVariantId),
    });
    for (const variant of product.variants) {
      if (!variant.ssBarcode) continue;
      if (variant.shopifyVariantId) shopifyBarcodes.push(variant.ssBarcode);
      else if (!demo) appIssued.push(variant.ssBarcode);
    }
  }
  const current = await prisma.barcodeCounter.findUnique({ where: { id: "series" } });
  const mark = seriesMarkAfterImport({ current: current?.lastIssued || null, shopifyBarcodes, appIssuedBarcodes: appIssued });
  if (mark.lastIssued) {
    await prisma.barcodeCounter.upsert({
      where: { id: "series" },
      update: { lastIssued: mark.lastIssued },
      create: { id: "series", lastIssued: mark.lastIssued },
    });
  }
  return mark.note;
}

function chunkResult(job: ImportJob, extra?: { error?: boolean; message?: string }) {
  return {
    done: job.phase === "done" && !extra?.error,
    error: Boolean(extra?.error),
    message: extra?.message || describeImportProgress(job),
    productsDone: job.productsDone,
    productsTotal: job.productsTotal,
    stamp: [job.phase, job.productsDone, job.ordersDone, job.productCursor, job.pendingProductIds.length, job.activeProductId, job.variantCursor, job.orderCursor].join(":"),
  };
}

export async function importStatus() {
  const job = await loadJob();
  if (!job) return { done: true, error: false, message: "Shopify has not been imported yet.", productsDone: 0, productsTotal: null as number | null, stamp: "none" };
  return chunkResult(job);
}

export async function runImportChunk(options: { fresh?: boolean; incremental?: boolean; budgetMs?: number; maxSteps?: number; read?: Read } = {}) {
  if (!shopifyConfigured()) {
    return { done: true, error: false, message: "Shopify is not connected yet.", productsDone: 0, productsTotal: null as number | null, stamp: "offline" };
  }
  const read = options.read || shopifyGraphql;
  let job = await loadJob();
  if (options.fresh || !job || (options.incremental && job.phase === "done")) {
    let search: string | null = null;
    if (options.incremental && !options.fresh) {
      const since = await setting("shopify_synced_at");
      search = /^\d{4}-\d{2}-\d{2}T/.test(since) ? `updated_at:>='${since}'` : null;
    }
    job = blankJob(search);
  }
  if (job.phase === "done" && !options.fresh) return chunkResult(job);
  const started = Date.now();
  const budgetMs = options.budgetMs ?? 20_000;
  const maxSteps = options.maxSteps ?? 40;
  let steps = 0;
  try {
    while (job.phase !== "done" && steps < maxSteps && Date.now() - started < budgetMs) {
      steps += 1;
      if (job.phase === "locations") {
        const data = await read<{ locations: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { id: string; name: string; isActive: boolean }[] } }>(LOCATIONS_QUERY, { cursor: job.locationCursor });
        for (const location of data.locations.nodes) {
          if (location.isActive) await ensureLocation(location.id, location.name);
        }
        if (data.locations.pageInfo.hasNextPage) job.locationCursor = data.locations.pageInfo.endCursor;
        else {
          job.phase = "products";
          job.productsTotal = await countOf(read, PRODUCTS_COUNT_QUERY, job.search);
        }
      } else if (job.phase === "products") {
        if (!job.activeProductId && job.pendingProductIds.length) job.activeProductId = job.pendingProductIds.shift() || null;
        if (job.activeProductId) {
          const page = await importVariantPage(read, job.activeProductId, job.variantCursor);
          if (page.done) {
            job.productsDone += 1;
            job.activeProductId = null;
            job.variantCursor = null;
          } else job.variantCursor = page.cursor || null;
        } else if (job.productPagesDone) {
          job.phase = "orders";
          job.ordersTotal = await countOf(read, ORDERS_COUNT_QUERY, job.search);
        } else {
          const data = await read<{ products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RemoteProduct[] } }>(PRODUCT_SHELLS_QUERY, { cursor: job.productCursor, search: job.search });
          for (const product of data.products.nodes) {
            await upsertRemoteProduct({ ...product, variants: { nodes: [] } });
            job.pendingProductIds.push(product.id);
          }
          if (data.products.pageInfo.hasNextPage) job.productCursor = data.products.pageInfo.endCursor;
          else job.productPagesDone = true;
          if (!data.products.nodes.length) job.productPagesDone = true;
        }
      } else if (job.phase === "orders") {
        const data = await read<{ orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Parameters<typeof graphqlOrder>[0][] } }>(ORDERS_QUERY, { cursor: job.orderCursor, search: job.search });
        for (const order of data.orders.nodes) {
          let lineCursor = order.lineItems.pageInfo?.hasNextPage ? order.lineItems.pageInfo.endCursor : null;
          while (lineCursor) {
            const more = await read<{ order: { lineItems: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: typeof order.lineItems.nodes } } | null }>(ORDER_LINES_QUERY, { id: order.id, cursor: lineCursor });
            order.lineItems.nodes.push(...(more.order?.lineItems.nodes || []));
            lineCursor = more.order?.lineItems.pageInfo.hasNextPage ? more.order.lineItems.pageInfo.endCursor : null;
          }
          await rememberOrder(graphqlOrder(order));
          job.ordersDone += 1;
        }
        if (data.orders.pageInfo.hasNextPage && data.orders.nodes.length) job.orderCursor = data.orders.pageInfo.endCursor;
        else job.phase = "finish";
      } else if (job.phase === "finish") {
        job.note = `Import finished. ${job.productsDone} products and ${job.ordersDone} orders are in S&S Software. ${await finishBarcodeSeries()}`;
        job.phase = "done";
        await putSetting("shopify_synced_at", new Date().toISOString());
      }
      await saveJob(job);
    }
  } catch (error) {
    await saveJob(job);
    const message = error instanceof Error ? error.message : "The import stopped. Press Continue.";
    return chunkResult(job, { error: true, message });
  }
  return chunkResult(job);
}

export async function importFromShopify() {
  const result = await runImportChunk({ fresh: true });
  await prisma.syncRun.create({ data: { kind: "shopify_import", status: result.done ? "ok" : "running", detail: result.message, finishedAt: result.done ? new Date() : null } });
  return { status: result.done ? "ok" : "partial", detail: result.message };
}

export async function reconcile(trigger: string) {
  const run = await prisma.syncRun.create({ data: { kind: "reconcile", status: "running", detail: trigger } });
  const result = await runImportChunk({ incremental: true, maxSteps: 4 });
  await prisma.syncRun.update({ where: { id: run.id }, data: { status: result.message.startsWith("Shopify is not") ? "skipped" : "ok", detail: result.message, finishedAt: new Date() } });
  return { status: "ok", detail: result.message };
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
