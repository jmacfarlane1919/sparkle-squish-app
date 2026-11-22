import { describe, expect, it } from "vitest";
import {
  invoiceDedupeKey,
  newAttachmentNames,
  normalizeInvoiceKey,
  parseInvoiceDate,
  parseUsdToCents,
  planInvoiceImport,
} from "@/lib/invoices/match";

const csv = [
  "Supplier,Invoice number,Date,Status,Amount USD,Category,Paid from",
  "Temu,PO-211-10000000000000099,2026-11-02,Paid,\"$1,240.50\",Inventory,PayPal",
  "Temu,211-10000000000000099,11/02/2026,Paid,1240.50,Inventory,",
  "Electrum Group,5XRVPHYJ6W,2026-10-14,Open,88.00,Supplies,",
  "Alibaba,318478019001027209,2026-09-01,Paid,640.00,Inventory,",
  "Mochi Lane,ML-458,2026-11-18,Open,76.80,Inventory,",
  "Short Co,12,2026-01-01,Open,5.00,Other,",
].join("\n");

const orders = [
  { id: "po-temu", number: "PO-211-10000000000000099", invoiceNumber: "", supplierName: "Temu" },
  { id: "po-mochi", number: "PO-1054", invoiceNumber: "ML-458", supplierName: "Mochi Lane" },
  { id: "po-copy", number: "PO-9999", invoiceNumber: "ML-458", supplierName: "Mochi Lane" },
];

describe("invoice import", () => {
  it("strips PO- and 211- prefixes and spaces", () => {
    expect(normalizeInvoiceKey("PO-211-10000000000000099")).toBe("10000000000000099");
    expect(normalizeInvoiceKey("211-10000000000000099")).toBe("10000000000000099");
    expect(normalizeInvoiceKey("5XRV PHYJ6W")).toBe("5xrvphyj6w");
    expect(invoiceDedupeKey("Temu", "PO-211-10000000000000099")).toBe(invoiceDedupeKey(" temu ", "211-10000000000000099"));
  });

  it("reads dates and dollar amounts", () => {
    expect(parseInvoiceDate("2026-11-02")).toBe("2026-11-02");
    expect(parseInvoiceDate("11/2/2026")).toBe("2026-11-02");
    expect(parseInvoiceDate("2026-02-31")).toBeNull();
    expect(parseUsdToCents("$1,240.50")).toBe(124050);
    expect(parseUsdToCents("88")).toBe(8800);
    expect(parseUsdToCents("nope")).toBeNull();
  });

  it("dedupes invoices, matches files by number, and links a purchase order", () => {
    const plan = planInvoiceImport({
      csv,
      filenames: [
        "Temu 211-10000000000000099.pdf",
        "Electrum Group 5XRVPHYJ6W.pdf",
        "Alibaba 318478019001027209.pdf",
        "Mochi Lane ML-458.pdf",
        "IMG_2088.jpeg",
        "PayPal_ Transaction Details.pdf",
        "Water-Drop-Slushy-Invoices-2026-11-02.pdf",
        "booth (1).png",
      ],
      purchaseOrders: [
        { id: "po-temu", number: "PO-211-10000000000000099", invoiceNumber: "", supplierName: "Temu" },
        { id: "po-mochi", number: "PO-1054", invoiceNumber: "ML-458", supplierName: "Mochi Lane" },
      ],
      suppliers: [
        { id: "sup-temu", name: "Temu" },
        { id: "sup-mochi", name: "Mochi Lane" },
      ],
    });

    expect(plan.errors).toEqual([]);
    expect(plan.collapsedDuplicates).toBe(1);
    expect(plan.invoices).toHaveLength(5);
    const temu = plan.invoices.find((invoice) => invoice.vendor === "Temu");
    expect(temu?.totalCents).toBe(124050);
    expect(temu?.status).toBe("paid");
    expect(temu?.paidFrom).toBe("PayPal");
    expect(temu?.supplierId).toBe("sup-temu");
    expect(temu?.purchaseOrderId).toBe("po-temu");
    expect(plan.invoices.find((invoice) => invoice.invoiceNumber === "ML-458")?.purchaseOrderNumber).toBe("PO-1054");

    const byName = new Map(plan.files.map((file) => [file.filename, file.invoiceKey]));
    expect(byName.get("Temu 211-10000000000000099.pdf")).toBe(temu?.key);
    expect(byName.get("Electrum Group 5XRVPHYJ6W.pdf")).toBe(invoiceDedupeKey("Electrum Group", "5XRVPHYJ6W"));
    expect(byName.get("Alibaba 318478019001027209.pdf")).toBe(invoiceDedupeKey("Alibaba", "318478019001027209"));
    expect(byName.get("Mochi Lane ML-458.pdf")).toBe(invoiceDedupeKey("Mochi Lane", "ML-458"));
    expect(byName.get("IMG_2088.jpeg")).toBeNull();
    expect(byName.get("PayPal_ Transaction Details.pdf")).toBeNull();
    expect(byName.get("Water-Drop-Slushy-Invoices-2026-11-02.pdf")).toBeNull();
    expect(byName.get("booth (1).png")).toBeNull();
    expect(plan.files.find((file) => file.filename === "Short Co 12.pdf")).toBeUndefined();
  });

  it("does not auto-link when two purchase orders share the invoice number", () => {
    const plan = planInvoiceImport({
      csv: "Supplier,Invoice number,Date,Status,Amount USD,Category\nMochi Lane,ML-458,2026-11-18,Open,10.00,Inventory\n",
      filenames: [],
      purchaseOrders: orders,
      suppliers: [],
    });
    expect(plan.invoices[0]?.purchaseOrderId).toBeNull();
  });

  it("prefers the longer invoice number when one number contains another", () => {
    const plan = planInvoiceImport({
      csv: [
        "Supplier,Invoice number,Date,Status,Amount USD,Category",
        "Alpha,100200,2026-01-02,Open,10.00,Inventory",
        "Alpha,1002,2026-01-02,Open,4.00,Inventory",
      ].join("\n"),
      filenames: ["Alpha 100200.pdf"],
      purchaseOrders: [],
      suppliers: [],
    });
    expect(plan.files[0]?.invoiceKey).toBe(invoiceDedupeKey("Alpha", "100200"));
  });

  it("imports the same file only once", () => {
    expect(newAttachmentNames(["Temu 211-10000000000000099.pdf"], ["Temu 211-10000000000000099.pdf", "IMG_2088.jpeg"])).toEqual([
      "IMG_2088.jpeg",
    ]);
    expect(newAttachmentNames(["IMG_2088.jpeg"], ["IMG_2088.jpeg"])).toEqual([]);
  });
});
