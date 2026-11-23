import { dollarsToCents } from "@/lib/format";
import { planPurchaseOrders, poPlanSummary, type PoPlan } from "@/lib/purchase-orders/csv";
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
import { enqueueImport } from "@/server/label-queue";

export type CsvPreview = {
  ready: { line: number; summary: string }[];
  errors: { line: number; message: string }[];
  summary?: string;
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
    const receivedOn = value(record, "received_at", "s_s_received_date");
    const receivedDay = receivedOn.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    const onHand = Number(value(record, "on_hand") || "0");
    if (product.variants[0] && receivedDay) {
      await prisma.product.update({
        where: { id: product.id },
        data: { receivedAt: new Date(`${receivedDay}T12:00:00Z`) },
      });
      await enqueueImport(product.variants[0].id, receivedDay, Number.isFinite(onHand) ? onHand : 0);
    }
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

async function purchaseOrderContext() {
  const [variants, suppliers, locations] = await Promise.all([
    prisma.variant.findMany({ select: { id: true, ssSku: true, vendorSku: true, costCents: true, product: { select: { title: true } } } }),
    prisma.supplier.findMany({ select: { id: true, name: true } }),
    prisma.location.findMany({ select: { id: true, name: true, isDefaultReceive: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    catalog: variants.map((variant) => ({ id: variant.id, title: variant.product.title, ssSku: variant.ssSku, vendorSku: variant.vendorSku, costCents: variant.costCents })),
    suppliers,
    locations,
  };
}

export async function previewOrders(text: string): Promise<CsvPreview> {
  const rows = rowsToRecords(text);
  if (!rows.length) return { ready: [], errors: [{ line: 1, message: "The file has no rows." }], summary: "0 purchase orders · 0 lines matched · 0 lines unlinked · 1 problem" };
  const plan = planPurchaseOrders({ rows, ...(await purchaseOrderContext()) });
  return previewFromPlan(plan);
}

function previewFromPlan(plan: PoPlan): CsvPreview {
  return {
    summary: poPlanSummary(plan),
    errors: plan.problems,
    ready: plan.orders.flatMap((order) =>
      order.lines.map((line) => ({
        line: line.line,
        summary: `${order.number} · ${line.description}${line.supplierSku ? ` · ${line.supplierSku}` : ""} · qty ${line.qtyOrdered} · ${line.linked ? "matched" : "incoming, not in the catalog yet"}`,
      })),
    ),
  };
}

export async function importPurchaseOrders(text: string) {
  const rows = rowsToRecords(text);
  const plan = planPurchaseOrders({ rows, ...(await purchaseOrderContext()) });
  if (plan.problems.length) return { imported: 0, errors: plan.problems, summary: poPlanSummary(plan) };
  let imported = 0;
  for (const order of plan.orders) {
    const existing = await prisma.purchaseOrder.findUnique({ where: { number: order.number }, include: { lines: true } });
    const data = {
      supplierId: order.supplierId,
      locationId: order.locationId,
      status: order.status,
      invoiceNumber: order.invoice,
      notes: order.notes,
      orderedAt: order.orderedAt ? new Date(order.orderedAt) : null,
    };
    const po = existing
      ? await prisma.purchaseOrder.update({ where: { id: existing.id }, data, include: { lines: true } })
      : await prisma.purchaseOrder.create({ data: { number: order.number, ...data }, include: { lines: true } });
    const used = new Set<string>();
    for (const line of order.lines) {
      const match = po.lines.find((row) => {
        if (used.has(row.id)) return false;
        if (line.variantId) return row.variantId === line.variantId && row.supplierSku === line.supplierSku && row.description === line.description;
        return !row.variantId && row.supplierSku === line.supplierSku && row.description === line.description;
      });
      const lineData = {
        variantId: line.variantId,
        description: line.description,
        supplierSku: line.supplierSku,
        qtyOrdered: match ? Math.max(line.qtyOrdered, match.qtyReceived) : line.qtyOrdered,
        qtyReceived: match ? Math.max(match.qtyReceived, line.qtyReceived) : line.qtyReceived,
        unitCostCents: line.cents,
        unitCostPrecise: line.precise,
      };
      if (match) {
        used.add(match.id);
        await prisma.purchaseOrderLine.update({ where: { id: match.id }, data: lineData });
      } else {
        await prisma.purchaseOrderLine.create({ data: { purchaseOrderId: po.id, ...lineData } });
      }
    }
    const leftovers = po.lines.filter((row) => !used.has(row.id) && row.qtyReceived === 0);
    if (leftovers.length) await prisma.purchaseOrderLine.deleteMany({ where: { id: { in: leftovers.map((row) => row.id) } } });
    imported += 1;
  }
  return {
    imported,
    errors: [] as CsvPreview["errors"],
    summary: `Saved ${imported} purchase orders. ${plan.matched} lines matched a product. ${plan.unlinked} incoming lines are waiting to be linked.`,
  };
}
