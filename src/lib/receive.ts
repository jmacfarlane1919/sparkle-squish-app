import { weightedAverageCostCents, type CostNote } from "@/lib/cost";
import { buildReceiveCostOperation, buildReceiveStockOperation } from "@/lib/shopify/payloads";
import type { ShopifyOperation } from "@/lib/shopify/guard";

export type ReceivePlan = {
  newOnHand: number;
  newCostCents: number;
  costNote: CostNote;
  stock: ShopifyOperation | null;
  cost: ShopifyOperation | null;
};

export function planReceive(input: {
  onHand: number;
  costCents: number | null;
  quantity: number;
  unitCostCents: number;
  inventoryItemId: string | null;
  locationId: string;
  referenceDocumentUri: string;
  idempotencyKey: string;
}): ReceivePlan {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("Receive quantity must be a positive whole number.");
  }
  const averaged = weightedAverageCostCents({
    onHandQty: input.onHand,
    currentCostCents: input.costCents,
    receivedQty: input.quantity,
    receivedUnitCostCents: input.unitCostCents,
  });
  const linked = Boolean(input.inventoryItemId);
  return {
    newOnHand: input.onHand + input.quantity,
    newCostCents: averaged.costCents,
    costNote: averaged.note,
    stock: linked
      ? buildReceiveStockOperation({
          delta: input.quantity,
          inventoryItemId: input.inventoryItemId as string,
          locationId: input.locationId,
          referenceDocumentUri: input.referenceDocumentUri,
          idempotencyKey: `${input.idempotencyKey}-stock`,
        })
      : null,
    cost: linked
      ? buildReceiveCostOperation({
          inventoryItemId: input.inventoryItemId as string,
          costCents: averaged.costCents,
        })
      : null,
  };
}
