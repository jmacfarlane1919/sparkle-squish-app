import { describe, expect, it } from "vitest";
import { weightedAverageCostCents } from "@/lib/cost";

describe("weighted average cost", () => {
  it("averages the old stock with the delivery", () => {
    expect(
      weightedAverageCostCents({
        onHandQty: 10,
        currentCostCents: 500,
        receivedQty: 10,
        receivedUnitCostCents: 700,
      }).costCents,
    ).toBe(600);
    expect(
      weightedAverageCostCents({
        onHandQty: 10,
        currentCostCents: 500,
        receivedQty: 4,
        receivedUnitCostCents: 700,
      }).costCents,
    ).toBe(557);
    expect(
      weightedAverageCostCents({
        onHandQty: 1,
        currentCostCents: 100,
        receivedQty: 1,
        receivedUnitCostCents: 101,
      }).costCents,
    ).toBe(101);
  });

  it("uses the received cost when nothing is on hand or the old cost is missing", () => {
    expect(
      weightedAverageCostCents({
        onHandQty: 0,
        currentCostCents: null,
        receivedQty: 5,
        receivedUnitCostCents: 450,
      }),
    ).toEqual({ costCents: 450, note: "weighted_average" });
    expect(
      weightedAverageCostCents({
        onHandQty: 4,
        currentCostCents: null,
        receivedQty: 2,
        receivedUnitCostCents: 300,
      }),
    ).toEqual({ costCents: 300, note: "used_received_cost" });
  });
});
