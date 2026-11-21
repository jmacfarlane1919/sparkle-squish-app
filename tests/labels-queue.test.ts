import { describe, expect, it } from "vitest";
import {
  applyPrint,
  applyReceipt,
  applyUndo,
  importQueueDecision,
  isAfterLabelCutoff,
  DEFAULT_LABELS_PRINTED_THROUGH,
} from "@/lib/labels/queue";

describe("receipts land in Needs labels", () => {
  it("enqueues the quantity received and leaves it unprinted", () => {
    const queue = applyReceipt([], { id: "line-1", qty: 6, receivedOn: "2026-11-21" });
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      status: "needs_labels",
      source: "receipt",
      suggestedQty: 6,
      printQty: 6,
      printedCount: 0,
      printedAt: null,
      receivedOn: "2026-11-21",
    });
  });

  it("does not enqueue a zero receive", () => {
    expect(applyReceipt([], { id: "line-0", qty: 0, receivedOn: "2026-11-21" })).toEqual([]);
  });
});

describe("printing marks the queue printed", () => {
  it("records the printed date and count, and undo puts them back", () => {
    const waiting = applyReceipt([], { id: "line-1", qty: 6, receivedOn: "2026-11-21" });
    const printed = applyPrint(waiting, ["line-1"], "2026-11-21T15:00:00.000Z");
    expect(printed[0].status).toBe("printed");
    expect(printed[0].printedCount).toBe(6);
    expect(printed[0].printedAt).toBe("2026-11-21T15:00:00.000Z");

    const again = applyPrint(printed, ["line-1"], "2026-11-22T15:00:00.000Z");
    expect(again[0].printedAt).toBe("2026-11-21T15:00:00.000Z");

    const undone = applyUndo(printed, ["line-1"]);
    expect(undone[0]).toMatchObject({ status: "needs_labels", printedCount: 0, printedAt: null });
  });
});

describe("Shopify import uses the labels-printed-through cutoff", () => {
  const cutoff = DEFAULT_LABELS_PRINTED_THROUGH;

  it("treats the cutoff date as already printed", () => {
    expect(isAfterLabelCutoff("2026-11-06", cutoff)).toBe(false);
    expect(isAfterLabelCutoff("2026-11-06T18:00:00Z", cutoff)).toBe(false);
    expect(importQueueDecision({ receivedOn: "2026-11-06", cutoff, onHand: 12, alreadyQueued: false })).toEqual({
      enqueue: false,
      qty: 0,
    });
  });

  it("queues everything received after the cutoff, using on-hand as the count", () => {
    expect(isAfterLabelCutoff("2026-11-07", cutoff)).toBe(true);
    expect(importQueueDecision({ receivedOn: "2026-11-07", cutoff, onHand: 8, alreadyQueued: false })).toEqual({
      enqueue: true,
      qty: 8,
    });
  });

  it("skips a blank received date, a zero on-hand, and a variant already queued", () => {
    expect(importQueueDecision({ receivedOn: null, cutoff, onHand: 4, alreadyQueued: false }).enqueue).toBe(false);
    expect(importQueueDecision({ receivedOn: "2026-11-20", cutoff, onHand: 0, alreadyQueued: false }).enqueue).toBe(false);
    expect(importQueueDecision({ receivedOn: "2026-11-20", cutoff, onHand: 5, alreadyQueued: true })).toEqual({
      enqueue: false,
      qty: 0,
    });
  });
});
