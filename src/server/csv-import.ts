import { dollarsToCents } from "@/lib/format";
import {
  LAST_ISSUED_BARCODE,
  allocateBarcode,
  allocateProductSku,
  isValidEan13,
  laterBarcode,
  normalizeCategory,
  normalizeVariantCode,
  parseSsSku,
} from "@/lib/identifiers";
import { rowsToRecords } from "@/lib/csv";
import { prisma } from "@/lib/db";

export type CsvPreview = {
  ready: { line: number; summary: string }[];
  errors: { line: number; message: string }[];
};

function value(record: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    if (record[key]) return record[key];
  }
  return "";
}

export function previewProducts(text: string): CsvPreview {
  const rows = rowsToRecords(text);
  const ready: CsvPreview["ready"] = [];
  const errors: CsvPreview["errors"] = [];
  rows.forEach(({ line, record }) => {
    const title = value(record, "title", "name", "product");
    if (!title) {
      errors.push({ line, message: "Each row needs a title." });
      return;
    }
    const price = dollarsToCents(value(record, "price"));
    if (price == null) errors.push({ line, message: `${title} needs a price like 14.00.` });
    const barcode = value(record, "ss_barcode", "s_s_barcode", "barcode_ss");
    if (barcode && !isValidEan13(barcode)) errors.push({ line, message: `${barcode} is not a valid EAN-13.` });
    const sku = value(record, "ss_sku", "s_s_sku");
    if (sku && !parseSsSku(sku)) errors.push({ line, message: `${sku} is not an S&S SKU.` });
    if (!errors.some((error) => error.line === line)) {
      ready.push({ line, summary: `${title} · ${sku || "new S&S SKU"} · ${value(record, "category", "category_code") || "SQ"}` });
    }
  });
  if (!rows.length) errors.push({ line: 1, message: "The file has no rows." });
  return { ready, errors };
}

export async function importProducts(text: string) {
  const preview = previewProducts(text);
  if (preview.errors.length) return { imported: 0, errors: preview.errors };
  let imported = 0;
  for (const { record } of rowsToRecords(text)) {
    const title = value(record, "title", "name", "product");
    const category = normalizeCategory(value(record, "category", "category_code") || "SQ");
    const variantCode = normalizeVariantCode(value(record, "variant_code", "code") || "STD");
    const existing = await prisma.variant.findMany({ select: { ssSku: true, ssBarcode: true } });
    const requestedSku = value(record, "ss_sku", "s_s_sku").toUpperCase();
    const ssSku = requestedSku
      ? requestedSku
      : allocateProductSku(category, existing.map((row) => row.ssSku).filter(Boolean), variantCode);
    if (existing.some((row) => row.ssSku.toUpperCase() === ssSku.toUpperCase())) {
      throw new Error(`${ssSku} is already in the catalog.`);
    }
    const counter = await prisma.barcodeCounter.findUnique({ where: { id: "series" } });
    const requestedBarcode = value(record, "ss_barcode", "s_s_barcode");
    const ssBarcode = requestedBarcode || allocateBarcode(counter?.lastIssued || LAST_ISSUED_BARCODE, existing.map((row) => row.ssBarcode).filter(Boolean));
    if (existing.some((row) => row.ssBarcode === ssBarcode)) throw new Error(`${ssBarcode} is already in use.`);
    const supplierName = value(record, "supplier");
    const supplier = supplierName ? await prisma.supplier.findFirst({ where: { name: supplierName } }) : null;
    const costRaw = value(record, "cost", "unit_cost");
    const product = await prisma.product.create({
      data: {
        title,
        description: value(record, "description"),
        categoryCode: category,
        brand: value(record, "brand"),
        texture: value(record, "texture"),
        season: value(record, "season"),
        size: value(record, "size"),
        material: value(record, "material"),
        ageGuidance: value(record, "age_guidance", "age"),
        newArrival: ["1", "true", "yes"].includes(value(record, "new_arrival").toLowerCase()),
        supplierId: supplier?.id,
        variants: {
          create: {
            title: value(record, "variant_title") || "Default",
            variantCode,
            vendorSku: value(record, "vendor_sku", "supplier_sku"),
            vendorBarcode: value(record, "vendor_barcode", "supplier_barcode", "upc"),
            ssSku,
            ssBarcode,
            priceCents: dollarsToCents(value(record, "price")) ?? 0,
            costCents: costRaw ? dollarsToCents(costRaw) : null,
          },
        },
      },
      include: { variants: true },
    });
    const locations = await prisma.location.findMany();
    if (product.variants[0] && locations.length) {
      await prisma.stockLevel.createMany({
        data: locations.map((location) => ({ variantId: product.variants[0].id, locationId: location.id, available: 0 })),
      });
    }
    await prisma.barcodeCounter.upsert({
      where: { id: "series" },
      update: { lastIssued: laterBarcode(counter?.lastIssued || ssBarcode, ssBarcode) },
      create: { id: "series", lastIssued: ssBarcode },
    });
    const known = await prisma.category.findUnique({ where: { code: category } });
    if (!known) await prisma.category.create({ data: { code: category, name: category, sortOrder: 99 } });
    imported += 1;
  }
  return { imported, errors: [] as CsvPreview["errors"] };
}

export function previewSuppliers(text: string): CsvPreview {
  const rows = rowsToRecords(text);
  const ready: CsvPreview["ready"] = [];
  const errors: CsvPreview["errors"] = [];
  rows.forEach(({ line, record }) => {
    const name = value(record, "name", "supplier");
    if (!name) errors.push({ line, message: "Each supplier needs a name." });
    else ready.push({ line, summary: name });
  });
  if (!rows.length) errors.push({ line: 1, message: "The file has no rows." });
  return { ready, errors };
}

export async function importSuppliers(text: string) {
  const preview = previewSuppliers(text);
  if (preview.errors.length) return { imported: 0, errors: preview.errors };
  let imported = 0;
  for (const { record } of rowsToRecords(text)) {
    const name = value(record, "name", "supplier");
    const data = {
      contactName: value(record, "contact_name", "contact"),
      email: value(record, "email"),
      phone: value(record, "phone"),
      notes: value(record, "notes"),
    };
    const existing = await prisma.supplier.findFirst({ where: { name } });
    if (existing) await prisma.supplier.update({ where: { id: existing.id }, data });
    else await prisma.supplier.create({ data: { name, ...data } });
    imported += 1;
  }
  return { imported, errors: [] as CsvPreview["errors"] };
}

export function previewOrders(text: string): CsvPreview {
  const rows = rowsToRecords(text);
  const ready: CsvPreview["ready"] = [];
  const errors: CsvPreview["errors"] = [];
  rows.forEach(({ line, record }) => {
    const po = value(record, "po_number", "number") || "(new)";
    const sku = value(record, "sku", "ss_sku", "vendor_sku");
    if (!value(record, "supplier")) errors.push({ line, message: "Each row needs a supplier." });
    if (!sku) errors.push({ line, message: "Each row needs a SKU." });
    else ready.push({ line, summary: `${po} · ${sku} · qty ${value(record, "qty_ordered", "quantity") || "?"}` });
  });
  if (!rows.length) errors.push({ line: 1, message: "The file has no rows." });
  return { ready, errors };
}

export async function importPurchaseOrders(text: string) {
  const preview = previewOrders(text);
  if (preview.errors.length) return { imported: 0, errors: preview.errors };
  const groups = new Map<string, { record: Record<string, string>; line: number }[]>();
  rowsToRecords(text).forEach((row) => {
    const key = value(row.record, "po_number", "number") || `row-${row.line}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  });
  let imported = 0;
  for (const [number, rows] of groups) {
    const first = rows[0].record;
    const supplier = await prisma.supplier.findFirst({ where: { name: value(first, "supplier") } });
    if (!supplier) throw new Error(`Add ${value(first, "supplier")} as a supplier before this purchase order.`);
    const locationName = value(first, "location") || "The Squishy Shop";
    const location = (await prisma.location.findFirst({ where: { name: locationName } })) || (await prisma.location.findFirst({ where: { isDefaultReceive: true } }));
    if (!location) throw new Error("Add a location before importing purchase orders.");
    const status = value(first, "status") || "draft";
    const po = await prisma.purchaseOrder.create({
      data: {
        number: number.startsWith("PO-") ? number : `PO-${number}`,
        supplierId: supplier.id,
        locationId: location.id,
        status,
        invoiceNumber: value(first, "invoice", "invoice_number"),
        notes: value(first, "notes"),
        orderedAt: ["ordered", "partial", "received"].includes(status) ? new Date(value(first, "ordered_at") || Date.now()) : null,
      },
    });
    for (const row of rows) {
      const sku = value(row.record, "sku", "ss_sku", "vendor_sku");
      const variant = await prisma.variant.findFirst({
        where: { OR: [{ ssSku: sku }, { ssSku: sku.toUpperCase() }, { vendorSku: sku }] },
        include: { product: true },
      });
      if (!variant) throw new Error(`${sku} is not in the catalog.`);
      const ordered = Number(value(row.record, "qty_ordered", "quantity") || "0");
      const received = Number(value(row.record, "qty_received") || "0");
      const cost = dollarsToCents(value(row.record, "unit_cost", "cost")) ?? variant.costCents ?? 0;
      await prisma.purchaseOrderLine.create({
        data: {
          purchaseOrderId: po.id,
          variantId: variant.id,
          description: variant.product.title,
          qtyOrdered: ordered,
          qtyReceived: received,
          unitCostCents: cost,
        },
      });
    }
    imported += 1;
  }
  return { imported, errors: [] as CsvPreview["errors"] };
}
