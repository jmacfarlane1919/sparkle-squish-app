import { buildCycleCountSetOperation } from "@/lib/shopify/payloads";
import type { ShopifyOperation } from "@/lib/shopify/guard";

export type CycleCountPlan =
  | { action: "skip"; reason: "sales_during_count" | "received_during_count"; operation: null }
  | { action: "set"; quantity: number; operation: ShopifyOperation | null };

export function planCycleCount(input: {
  countedQty: number;
  changeFromQuantity: number;
  salesQtyDuringCount: number;
  receivedQtyDuringCount: number;
  inventoryItemId: string | null;
  locationId: string;
  referenceDocumentUri: string;
  idempotencyKey: string;
}): CycleCountPlan {
  if (!Number.isInteger(input.countedQty) || input.countedQty < 0) {
    throw new Error("Counted quantity must be a whole number.");
  }
  if (input.salesQtyDuringCount > 0) {
    return { action: "skip", reason: "sales_during_count", operation: null };
  }
  if (input.receivedQtyDuringCount > 0) {
    return { action: "skip", reason: "received_during_count", operation: null };
  }
  return {
    action: "set",
    quantity: input.countedQty,
    operation: input.inventoryItemId
      ? buildCycleCountSetOperation({
          inventoryItemId: input.inventoryItemId,
          locationId: input.locationId,
          quantity: input.countedQty,
          changeFromQuantity: input.changeFromQuantity,
          referenceDocumentUri: input.referenceDocumentUri,
          idempotencyKey: input.idempotencyKey,
        })
      : null,
  };
}
