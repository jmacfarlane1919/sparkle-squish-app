export const DEFAULT_LABELS_PRINTED_THROUGH = "2026-11-06";

export type LabelSource = "receipt" | "new_product" | "import";
export type LabelStatus = "needs_labels" | "printed";

export type QueueItemState = {
  id: string;
  status: LabelStatus;
  printQty: number;
  printedCount: number;
  printedAt: string | null;
  source: LabelSource;
  receivedOn: string;
  suggestedQty: number;
};

const DATE = /^(\d{4}-\d{2}-\d{2})/;

export function dateOnly(value: string | null | undefined) {
  const match = value?.match(DATE);
  return match ? match[1] : null;
}

/** Deliveries on the cutoff date are already printed. Only a later date needs labels. */
export function isAfterLabelCutoff(receivedOn: string | null | undefined, cutoff: string) {
  const day = dateOnly(receivedOn);
  const cut = dateOnly(cutoff);
  if (!day || !cut) return false;
  return day > cut;
}

export function receiptDecision(qty: number) {
  if (!Number.isInteger(qty) || qty <= 0) return { enqueue: false as const, qty: 0 };
  return { enqueue: true as const, qty };
}

export function newProductDecision(onHand: number) {
  const qty = Number.isInteger(onHand) && onHand > 0 ? onHand : 1;
  return { enqueue: true as const, qty };
}

export function importQueueDecision(input: {
  receivedOn: string | null | undefined;
  cutoff: string;
  onHand: number;
  alreadyQueued: boolean;
}) {
  if (input.alreadyQueued) return { enqueue: false as const, qty: 0 };
  if (!isAfterLabelCutoff(input.receivedOn, input.cutoff)) return { enqueue: false as const, qty: 0 };
  const qty = Number.isFinite(input.onHand) ? Math.max(0, Math.floor(input.onHand)) : 0;
  if (qty <= 0) return { enqueue: false as const, qty: 0 };
  return { enqueue: true as const, qty };
}

export function applyReceipt(queue: QueueItemState[], input: { id: string; qty: number; receivedOn: string }) {
  const decision = receiptDecision(input.qty);
  if (!decision.enqueue) return queue;
  return [
    ...queue,
    {
      id: input.id,
      status: "needs_labels" as const,
      printQty: decision.qty,
      suggestedQty: decision.qty,
      printedCount: 0,
      printedAt: null,
      source: "receipt" as const,
      receivedOn: input.receivedOn,
    },
  ];
}

export function markPrintedPlan(items: { id: string; status: string; printQty: number }[]) {
  const ready = items.filter((item) => item.status === "needs_labels" && Number.isInteger(item.printQty) && item.printQty > 0);
  return {
    itemIds: ready.map((item) => item.id),
    labelCount: ready.reduce((sum, item) => sum + item.printQty, 0),
  };
}

export function applyPrint(queue: QueueItemState[], ids: string[], printedAt: string) {
  const plan = markPrintedPlan(queue.filter((item) => ids.includes(item.id)));
  return queue.map((item) => {
    if (!plan.itemIds.includes(item.id)) return item;
    return { ...item, status: "printed" as const, printedCount: item.printQty, printedAt };
  });
}

export function applyUndo(queue: QueueItemState[], ids: string[]) {
  return queue.map((item) => {
    if (!ids.includes(item.id) || item.status !== "printed") return item;
    return { ...item, status: "needs_labels" as const, printedCount: 0, printedAt: null };
  });
}
