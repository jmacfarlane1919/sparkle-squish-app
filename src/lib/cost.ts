export type CostNote = "weighted_average" | "used_received_cost";

export function weightedAverageCostCents(input: {
  onHandQty: number;
  currentCostCents: number | null;
  receivedQty: number;
  receivedUnitCostCents: number;
}): { costCents: number; note: CostNote } {
  const { onHandQty, currentCostCents, receivedQty, receivedUnitCostCents } = input;
  if (!Number.isInteger(receivedQty) || receivedQty <= 0) {
    throw new Error("Received quantity must be a positive whole number.");
  }
  if (!Number.isInteger(receivedUnitCostCents) || receivedUnitCostCents < 0) {
    throw new Error("Received unit cost must be zero or a positive number of cents.");
  }
  if (onHandQty <= 0) {
    return { costCents: receivedUnitCostCents, note: "weighted_average" };
  }
  if (currentCostCents == null) {
    return { costCents: receivedUnitCostCents, note: "used_received_cost" };
  }
  if (!Number.isInteger(currentCostCents) || currentCostCents < 0) {
    throw new Error("Current unit cost must be zero or a positive number of cents.");
  }
  const totalQty = onHandQty + receivedQty;
  const totalCents = onHandQty * currentCostCents + receivedQty * receivedUnitCostCents;
  return { costCents: Math.round(totalCents / totalQty), note: "weighted_average" };
}
