import { describe, expect, it } from "vitest";
import { planReceive } from "@/lib/receive";

const base = {
  inventoryItemId: "gid://shopify/InventoryItem/1",
  locationId: "gid://shopify/Location/2",
  referenceDocumentUri: "app://receipts/1",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
};

describe("receive adds stock", () => {
  it("adds the delivery to on-hand and sends a delta, not a new total", () => {
    const plan = planReceive({
      ...base,
      onHand: 10,
      costCents: 500,
      quantity: 4,
      unitCostCents: 700,
    });
    expect(plan.newOnHand).toBe(14);
    expect(plan.newOnHand).not.toBe(4);
    expect(plan.newCostCents).toBe(557);
    expect(plan.stock?.name).toBe("inventoryAdjustQuantities");
    expect(plan.stock?.query).not.toContain("inventorySetQuantities");
    const input = plan.stock?.variables.input as {
      changes: { delta: number; quantity?: number }[];
    };
    expect(input.changes[0].delta).toBe(4);
    expect(input.changes[0]).not.toHaveProperty("quantity");
    expect(JSON.stringify(plan.stock)).not.toMatch(/"sku"|"barcode"|"barcodes"/);
    const costInput = plan.cost?.variables.input as Record<string, unknown>;
    expect(Object.keys(costInput)).toEqual(["cost"]);
    expect(costInput.cost).toBe("5.57");
  });

  it("rejects a zero or negative receive", () => {
    expect(() =>
      planReceive({
        ...base,
        onHand: 10,
        costCents: 500,
        quantity: 0,
        unitCostCents: 700,
      }),
    ).toThrow(/positive/);
  });
});
