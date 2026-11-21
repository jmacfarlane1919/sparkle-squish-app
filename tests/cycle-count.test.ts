import { describe, expect, it } from "vitest";
import { planCycleCount } from "@/lib/cycle-count";

const base = {
  countedQty: 10,
  changeFromQuantity: 12,
  inventoryItemId: "gid://shopify/InventoryItem/1",
  locationId: "gid://shopify/Location/2",
  referenceDocumentUri: "app://counts/1",
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
};

describe("cycle count", () => {
  it("does not set an absolute quantity when the item sold during the count", () => {
    const plan = planCycleCount({ ...base, salesQtyDuringCount: 1, receivedQtyDuringCount: 0 });
    expect(plan.action).toBe("skip");
    expect(plan.operation).toBeNull();
  });

  it("sets the counted quantity only when nothing sold or arrived", () => {
    const plan = planCycleCount({ ...base, salesQtyDuringCount: 0, receivedQtyDuringCount: 0 });
    expect(plan.action).toBe("set");
    if (plan.action !== "set" || !plan.operation) throw new Error("expected a set");
    expect(plan.operation.name).toBe("inventorySetQuantities");
    const quantities = (plan.operation.variables.input as { quantities: { quantity: number; changeFromQuantity: number }[] }).quantities;
    expect(quantities[0].quantity).toBe(10);
    expect(quantities[0].changeFromQuantity).toBe(12);
    expect(JSON.stringify(plan.operation.variables)).not.toMatch(/"sku"|"barcode"|"barcodes"/);
  });
});
