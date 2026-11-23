import { describe, expect, it } from "vitest";
import { parsePreciseDollars } from "@/lib/format";
import { normalizePoNumber, pickImportLocation, planPurchaseOrders, poPlanSummary } from "@/lib/purchase-orders/csv";
import { rowsToRecords } from "@/lib/csv";

const catalog = [
  { id: "var-peach", title: "Peach Mochi Bear", ssSku: "SS-SQ-043-STD", vendorSku: "MOCHI-BEAR-PCH", costCents: 525 },
];
const suppliers = [{ id: "sup-speks", name: "Speks" }, { id: "sup-mochi", name: "Mochi Lane" }];
const oneLocation = [{ id: "loc-1", name: "The Squishy Shop", isDefaultReceive: true }];

function plan(csv: string, locations = oneLocation) {
  return planPurchaseOrders({ rows: rowsToRecords(csv), catalog, suppliers, locations });
}

describe("purchase order CSV", () => {
  it("keeps a number that already looks like a PO and strips a leading hash", () => {
    expect(normalizePoNumber("#PO43")).toBe("PO43");
    expect(normalizePoNumber("PO-1054")).toBe("PO-1054");
    expect(normalizePoNumber("#43")).toBe("PO-43");
    expect(normalizePoNumber("43")).toBe("PO-43");
  });

  it("saves an unknown or blank SKU as an incoming line and does not require a Shopify product", () => {
    const csv = [
      "po_number,supplier,sku,product,supplier_sku,qty_ordered,unit_cost",
      "#PO43,Speks,SS-SQ-043-STD,Peach Mochi Bear,,2,5.25",
      "#PO43,Speks,,Zorbitz Orb,ZOR-ORB,5,4.025",
      "#PO43,Speks,,Hape Display,,1,",
    ].join("\n");
    const result = plan(`${csv}\n`);
    const fixed = result.orders[0];
    expect(fixed.number).toBe("PO43");
    expect(result.matched).toBe(1);
    expect(result.unlinked).toBe(1);
    expect(result.problems).toEqual([{ line: 4, message: "Each line needs a unit cost, like 4.025, or a line total." }]);
    const incoming = fixed.lines.find((line) => line.productName === "Zorbitz Orb");
    expect(incoming?.variantId).toBeNull();
    expect(incoming?.supplierSku).toBe("ZOR-ORB");
    expect(incoming?.precise).toBe(40250);
    expect(incoming?.cents).toBe(403);
  });

  it("derives a four-decimal unit cost from the line total and uses the only location", () => {
    const csv = "po_number,supplier,product,qty_ordered,line_total\nPO43,Speks,Hape Display,2,8.05\n";
    const result = plan(csv, [{ id: "only", name: "Back room", isDefaultReceive: false }]);
    expect(result.problems).toEqual([]);
    expect(result.orders[0].locationId).toBe("only");
    expect(result.orders[0].lines[0].precise).toBe(40250);
    expect(parsePreciseDollars("$4.025")?.precise).toBe(40250);
    expect(poPlanSummary(result)).toBe("1 purchase order · 0 lines matched · 1 line unlinked · 0 problems");
  });

  it("uses the first location when the cell is blank and more than one location exists", () => {
    const locations = [
      { id: "a", name: "Alpha", isDefaultReceive: false },
      { id: "b", name: "Beta", isDefaultReceive: true },
    ];
    expect(pickImportLocation("", locations)?.id).toBe("b");
    expect(pickImportLocation("", [locations[0]])?.id).toBe("a");
    expect(pickImportLocation("Missing", locations)).toBeNull();
  });
});
