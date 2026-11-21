"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { dollarsToCents, formatMoney } from "@/lib/format";
import { matchField } from "@/lib/identifiers";
import { planReceive } from "@/lib/receive";
import { prisma } from "@/lib/db";
import { executeFeature } from "@/server/shopify-exec";
import { go } from "@/server/nav";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

async function nextPoNumber() {
  const row = await prisma.appSetting.findUnique({ where: { key: "po_next" } });
  const number = Number(row?.value || "1058");
  await prisma.appSetting.upsert({
    where: { key: "po_next" },
    update: { value: String(number + 1) },
    create: { key: "po_next", value: String(number + 1) },
  });
  return `PO-${number}`;
}

export async function createSupplier(formData: FormData) {
  const name = text(formData, "name");
  if (!name) go("/suppliers/new", { error: "Add the supplier name." });
  const supplier = await prisma.supplier.create({
    data: {
      name,
      contactName: text(formData, "contactName"),
      email: text(formData, "email"),
      phone: text(formData, "phone"),
      notes: text(formData, "notes"),
    },
  });
  revalidatePath("/suppliers");
  go(`/suppliers/${supplier.id}`, { notice: `${name} is on the supplier list.` });
}

export async function updateSupplier(formData: FormData) {
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!name) go(`/suppliers/${id}`, { error: "The supplier needs a name." });
  await prisma.supplier.update({
    where: { id },
    data: {
      name,
      contactName: text(formData, "contactName"),
      email: text(formData, "email"),
      phone: text(formData, "phone"),
      notes: text(formData, "notes"),
    },
  });
  go(`/suppliers/${id}`, { notice: "Supplier saved." });
}

export async function createPurchaseOrder(formData: FormData) {
  const supplierId = text(formData, "supplierId");
  const locationId = text(formData, "locationId");
  const variantId = text(formData, "variantId");
  const qty = Number(text(formData, "qty"));
  const cost = dollarsToCents(text(formData, "cost"));
  if (!supplierId || !locationId) go("/purchase-orders/new", { error: "Choose a supplier and a location." });
  if (!variantId || !Number.isInteger(qty) || qty <= 0 || cost == null) {
    go("/purchase-orders/new", { error: "Add one item, a quantity, and a unit cost to start the order." });
  }
  const variant = await prisma.variant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!variant) go("/purchase-orders/new", { error: "That product is not in the catalog." });
  const number = await nextPoNumber();
  const po = await prisma.purchaseOrder.create({
    data: {
      number,
      supplierId,
      locationId,
      status: "draft",
      invoiceNumber: text(formData, "invoiceNumber"),
      notes: text(formData, "notes"),
      lines: {
        create: {
          variantId,
          description: variant.product.title,
          qtyOrdered: qty,
          unitCostCents: cost,
        },
      },
    },
  });
  go(`/receive/${po.id}`, { notice: `${number} is a draft. Mark it ordered when you send it.` });
}

export async function addPurchaseOrderLine(formData: FormData) {
  const id = text(formData, "id");
  const variantId = text(formData, "variantId");
  const qty = Number(text(formData, "qty"));
  const cost = dollarsToCents(text(formData, "cost"));
  if (!variantId || !Number.isInteger(qty) || qty <= 0 || cost == null) {
    go(`/receive/${id}`, { error: "Add an item, a quantity, and a unit cost." });
  }
  const variant = await prisma.variant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!variant) go(`/receive/${id}`, { error: "That product is not in the catalog." });
  await prisma.purchaseOrderLine.create({
    data: { purchaseOrderId: id, variantId, description: variant.product.title, qtyOrdered: qty, unitCostCents: cost },
  });
  go(`/receive/${id}`, { notice: `Added ${variant.product.title}.` });
}

export async function markOrdered(formData: FormData) {
  const id = text(formData, "id");
  await prisma.purchaseOrder.update({
    where: { id },
    data: { status: "ordered", orderedAt: new Date() },
  });
  go(`/receive/${id}`, { notice: "Marked ordered. You can check items in as they arrive." });
}

export async function receiveLine(formData: FormData) {
  const lineId = text(formData, "lineId");
  const qty = Number(text(formData, "qty"));
  const line = await prisma.purchaseOrderLine.findUnique({
    where: { id: lineId },
    include: {
      purchaseOrder: { include: { location: true, lines: true } },
      variant: { include: { levels: true, product: true } },
    },
  });
  if (!line || !line.variant) go("/receive", { error: "That line is not on an open order." });
  const po = line.purchaseOrder;
  if (po.status !== "ordered" && po.status !== "partial") {
    go(`/receive/${po.id}`, { error: "Mark the purchase order ordered before checking items in." });
  }
  const remaining = line.qtyOrdered - line.qtyReceived;
  if (!Number.isInteger(qty) || qty <= 0 || qty > remaining) {
    go(`/receive/${po.id}`, { error: `Enter a quantity from 1 to ${remaining}.` });
  }
  const onHand = line.variant.levels.find((level) => level.locationId === po.locationId)?.available ?? 0;
  const plan = planReceive({
    onHand,
    costCents: line.variant.costCents,
    quantity: qty,
    unitCostCents: line.unitCostCents,
    inventoryItemId: line.variant.shopifyInventoryItemId,
    locationId: po.location.shopifyLocationId || `gid://shopify/Location/local-${po.locationId}`,
    referenceDocumentUri: `app://purchase-orders/${po.number}`,
    idempotencyKey: randomUUID(),
  });
  const receipt = await prisma.receipt.create({
    data: {
      purchaseOrderId: po.id,
      note: text(formData, "note") || `Checked in ${qty} of ${line.variant.product.title}.`,
      shopifyStatus: "pending",
      lines: {
        create: {
          purchaseOrderLineId: line.id,
          variantId: line.variant.id,
          qty,
          unitCostCents: line.unitCostCents,
          previousOnHand: onHand,
          previousCostCents: line.variant.costCents,
          newOnHand: plan.newOnHand,
          newCostCents: plan.newCostCents,
        },
      },
    },
  });
  await prisma.purchaseOrderLine.update({ where: { id: line.id }, data: { qtyReceived: line.qtyReceived + qty } });
  await prisma.variant.update({ where: { id: line.variant.id }, data: { costCents: plan.newCostCents } });
  await prisma.stockLevel.upsert({
    where: { variantId_locationId: { variantId: line.variant.id, locationId: po.locationId } },
    update: { available: plan.newOnHand },
    create: { variantId: line.variant.id, locationId: po.locationId, available: plan.newOnHand },
  });
  if (!line.variant.product.receivedAt) {
    await prisma.product.update({ where: { id: line.variant.productId }, data: { receivedAt: new Date() } });
  }
  const freshLines = po.lines.map((row) =>
    row.id === line.id ? { ...row, qtyReceived: row.qtyReceived + qty } : row,
  );
  const fully = freshLines.every((row) => row.qtyReceived >= row.qtyOrdered);
  await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: fully ? "received" : "partial" },
  });

  const summary = `Add ${qty} of ${line.variant.product.title} at ${po.location.name}. New on-hand ${plan.newOnHand}. Unit cost ${formatMoney(plan.newCostCents)}.`;
  const stock = plan.stock
    ? await executeFeature("receive_stock", "Receive stock", summary, [plan.stock])
    : { mode: "dry_run" as const, result: "This variant is not linked to a Shopify inventory item yet." };
  const cost = plan.cost
    ? await executeFeature("receive_cost", "Update unit cost", summary, [plan.cost])
    : { mode: "dry_run" as const, result: "No Shopify inventory item to update." };
  await prisma.receipt.update({
    where: { id: receipt.id },
    data: { shopifyStatus: stock.mode === "live" && cost.mode === "live" ? "sent" : stock.mode },
  });
  revalidatePath("/inventory");
  go(`/receive/${po.id}`, {
    notice: `Checked in ${qty}. On hand is now ${plan.newOnHand}. ${stock.result}`,
  });
}

export async function lookupReceiveCode(formData: FormData) {
  const id = text(formData, "id");
  const code = text(formData, "code");
  go(`/receive/${id}?code=${encodeURIComponent(code)}`);
}

export async function findVariantForCode(code: string) {
  const variants = await prisma.variant.findMany({ include: { product: true } });
  return variants.filter((variant) => matchField(variant, code));
}
