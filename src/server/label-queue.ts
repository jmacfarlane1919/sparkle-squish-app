import { chicagoDateKey, formatMoney } from "@/lib/format";
import {
  DEFAULT_LABELS_PRINTED_THROUGH,
  dateOnly,
  importQueueDecision,
  newProductDecision,
  receiptDecision,
} from "@/lib/labels/queue";
import type { PrintedLabel } from "@/lib/labels/render";
import { prisma } from "@/lib/db";

export type { PrintedLabel };

export async function labelsPrintedThrough() {
  const row = await prisma.appSetting.findUnique({ where: { key: "labels_printed_through" } });
  return dateOnly(row?.value) || DEFAULT_LABELS_PRINTED_THROUGH;
}

export async function needsLabelCount() {
  return prisma.labelQueueItem.count({ where: { status: "needs_labels" } });
}

export async function enqueueReceipt(input: { receiptLineId: string; variantId: string; qty: number; receivedAt: Date }) {
  const decision = receiptDecision(input.qty);
  if (!decision.enqueue) return null;
  const receivedOn = chicagoDateKey(input.receivedAt);
  return prisma.labelQueueItem.upsert({
    where: { sourceKey: `receipt:${input.receiptLineId}` },
    update: {},
    create: {
      variantId: input.variantId,
      source: "receipt",
      sourceKey: `receipt:${input.receiptLineId}`,
      receivedOn,
      suggestedQty: decision.qty,
      printQty: decision.qty,
      status: "needs_labels",
    },
  });
}

export async function enqueueNewProduct(variantId: string, onHand: number) {
  const decision = newProductDecision(onHand);
  return prisma.labelQueueItem.upsert({
    where: { sourceKey: `new:${variantId}` },
    update: {},
    create: {
      variantId,
      source: "new_product",
      sourceKey: `new:${variantId}`,
      receivedOn: chicagoDateKey(new Date()),
      suggestedQty: decision.qty,
      printQty: decision.qty,
      status: "needs_labels",
    },
  });
}

export async function enqueueImport(variantId: string, receivedOn: string | null | undefined, onHand: number) {
  const cutoff = await labelsPrintedThrough();
  const existing = await prisma.labelQueueItem.findFirst({
    where: { variantId, source: "import", receivedOn: dateOnly(receivedOn) || "" },
  });
  const decision = importQueueDecision({
    receivedOn,
    cutoff,
    onHand,
    alreadyQueued: Boolean(existing),
  });
  if (!decision.enqueue || !dateOnly(receivedOn)) return null;
  const day = dateOnly(receivedOn) as string;
  return prisma.labelQueueItem.upsert({
    where: { sourceKey: `import:${variantId}:${day}` },
    update: {},
    create: {
      variantId,
      source: "import",
      sourceKey: `import:${variantId}:${day}`,
      receivedOn: day,
      suggestedQty: decision.qty,
      printQty: decision.qty,
      status: "needs_labels",
    },
  });
}

export function labelName(productTitle: string, variantTitle: string) {
  if (!variantTitle || variantTitle === "Default" || variantTitle === "Default Title") return productTitle;
  return `${productTitle} · ${variantTitle}`;
}

export async function queueRows(status: "needs_labels" | "printed" = "needs_labels") {
  const items = await prisma.labelQueueItem.findMany({
    where: { status },
    include: { variant: { include: { product: true } } },
    orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }],
  });
  return items.map((item) => ({
    id: item.id,
    receivedOn: item.receivedOn,
    source: item.source,
    suggestedQty: item.suggestedQty,
    printQty: item.printQty,
    status: item.status,
    printedAt: item.printedAt?.toISOString() ?? null,
    printedCount: item.printedCount,
    name: labelName(item.variant.product.title, item.variant.title),
    price: formatMoney(item.variant.priceCents),
    sku: item.variant.ssSku,
    barcode: item.variant.ssBarcode,
  }));
}

export function snapshotFromRows(rows: Awaited<ReturnType<typeof queueRows>>, qtyFor: Map<string, number>): PrintedLabel[] {
  return rows
    .filter((row) => row.barcode)
    .map((row) => ({
      queueItemId: row.id,
      name: row.name,
      price: row.price,
      sku: row.sku,
      barcode: row.barcode,
      qty: qtyFor.get(row.id) ?? row.printQty,
    }))
    .filter((row) => row.qty > 0);
}
