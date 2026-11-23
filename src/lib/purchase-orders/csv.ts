import { parsePreciseDollars } from "@/lib/format";

export type PoCatalogItem = { id: string; title: string; ssSku: string; vendorSku: string; costCents: number | null };
export type PoLocation = { id: string; name: string; isDefaultReceive: boolean };
export type PoSupplier = { id: string; name: string };

export type PlannedPoLine = {
  line: number;
  productName: string;
  supplierSku: string;
  sku: string;
  qtyOrdered: number;
  qtyReceived: number;
  cents: number;
  precise: number;
  variantId: string | null;
  description: string;
  linked: boolean;
};

export type PlannedPo = {
  number: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  locationName: string;
  status: string;
  invoice: string;
  notes: string;
  orderedAt: string | null;
  lines: PlannedPoLine[];
};

export type PoPlan = {
  orders: PlannedPo[];
  matched: number;
  unlinked: number;
  problems: { line: number; message: string }[];
};

export function normalizePoNumber(raw: string) {
  let value = raw.trim();
  if (value.startsWith("#")) value = value.slice(1).trim();
  if (!value) return "";
  if (/^po(?:-|\s)?\d/i.test(value) || /^po-/i.test(value)) return value;
  return `PO-${value}`;
}

export function pickImportLocation(name: string, locations: PoLocation[]) {
  const wanted = name.trim().toLowerCase();
  if (wanted) return locations.find((location) => location.name.toLowerCase() === wanted) || null;
  if (locations.length === 0) return null;
  if (locations.length === 1) return locations[0];
  return locations.find((location) => location.isDefaultReceive) || locations[0];
}

function cell(record: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    if (record[key]) return record[key];
  }
  return "";
}

function matchItem(sku: string, catalog: PoCatalogItem[]) {
  const key = sku.trim().toLowerCase();
  if (!key) return null;
  return catalog.find((item) => item.ssSku.toLowerCase() === key || item.vendorSku.toLowerCase() === key) || null;
}

export function planPurchaseOrders(input: {
  rows: { line: number; record: Record<string, string> }[];
  catalog: PoCatalogItem[];
  suppliers: PoSupplier[];
  locations: PoLocation[];
}): PoPlan {
  const problems: PoPlan["problems"] = [];
  const groups = new Map<string, { line: number; record: Record<string, string> }[]>();
  for (const row of input.rows) {
    const rawNumber = cell(row.record, "po_number", "number");
    const number = normalizePoNumber(rawNumber);
    if (!number) {
      problems.push({ line: row.line, message: "Each row needs a PO number." });
      continue;
    }
    groups.set(number, [...(groups.get(number) || []), row]);
  }

  const orders: PlannedPo[] = [];
  let matched = 0;
  let unlinked = 0;

  for (const [number, rows] of groups) {
    const first = rows[0].record;
    const supplierName = cell(first, "supplier");
    const supplier = input.suppliers.find((item) => item.name.toLowerCase() === supplierName.toLowerCase());
    if (!supplierName || !supplier) {
      problems.push({ line: rows[0].line, message: supplierName ? `Add ${supplierName} as a supplier before this purchase order.` : "Each row needs a supplier." });
      continue;
    }
    const locationName = cell(first, "location");
    const location = pickImportLocation(locationName, input.locations);
    if (!location) {
      problems.push({
        line: rows[0].line,
        message: locationName ? `No location is named ${locationName}.` : "Add a location before importing purchase orders.",
      });
      continue;
    }
    const status = (cell(first, "status") || "draft").toLowerCase();
    const orderedRaw = cell(first, "ordered_at");
    let orderedAt: string | null = null;
    if (orderedRaw) {
      const parsed = new Date(orderedRaw);
      if (Number.isNaN(parsed.getTime())) problems.push({ line: rows[0].line, message: `${orderedRaw} is not a date this import understands.` });
      else orderedAt = parsed.toISOString();
    } else if (["ordered", "partial", "received"].includes(status)) orderedAt = new Date().toISOString();

    const lines: PlannedPoLine[] = [];
    for (const row of rows) {
      const sku = cell(row.record, "sku", "ss_sku", "vendor_sku");
      const supplierSku = cell(row.record, "supplier_sku") || (sku && !sku.toUpperCase().startsWith("SS-") ? sku : "");
      const productName = cell(row.record, "product", "item", "item_name", "title");
      const item = matchItem(sku, input.catalog) || matchItem(supplierSku, input.catalog);
      if (!item && !productName && !sku && !supplierSku) {
        problems.push({ line: row.line, message: "Each line needs a SKU or a product name." });
        continue;
      }
      const qtyOrdered = Number(cell(row.record, "qty_ordered", "quantity") || "0");
      const qtyReceived = Number(cell(row.record, "qty_received") || "0");
      if (!Number.isInteger(qtyOrdered) || qtyOrdered < 0 || !Number.isInteger(qtyReceived) || qtyReceived < 0) {
        problems.push({ line: row.line, message: "Quantities need to be whole numbers." });
        continue;
      }
      const cost = parsePreciseDollars(cell(row.record, "unit_cost", "cost")) || (() => {
        const total = parsePreciseDollars(cell(row.record, "line_total", "total"));
        if (!total || qtyOrdered <= 0) return null;
        const precise = Math.round(total.precise / qtyOrdered);
        return { precise, cents: Math.round(precise / 100) };
      })();
      const fallback = item?.costCents != null ? { cents: item.costCents, precise: item.costCents * 100 } : null;
      const priced = cost || fallback;
      if (!priced) {
        problems.push({ line: row.line, message: "Each line needs a unit cost, like 4.025, or a line total." });
        continue;
      }
      const linked = Boolean(item);
      if (linked) matched += 1;
      else unlinked += 1;
      lines.push({
        line: row.line,
        productName: productName || item?.title || sku,
        supplierSku,
        sku,
        qtyOrdered,
        qtyReceived,
        cents: priced.cents,
        precise: priced.precise,
        variantId: item?.id || null,
        description: productName || item?.title || supplierSku || sku,
        linked,
      });
    }
    if (lines.length) {
      orders.push({
        number,
        supplierId: supplier.id,
        supplierName: supplier.name,
        locationId: location.id,
        locationName: location.name,
        status: ["draft", "ordered", "partial", "received"].includes(status) ? status : "draft",
        invoice: cell(first, "invoice", "invoice_number"),
        notes: cell(first, "notes"),
        orderedAt,
        lines,
      });
    }
  }

  return { orders, matched, unlinked, problems };
}

function counted(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function poPlanSummary(plan: PoPlan) {
  return `${counted(plan.orders.length, "purchase order")} · ${counted(plan.matched, "line matched", "lines matched")} · ${counted(plan.unlinked, "line unlinked", "lines unlinked")} · ${counted(plan.problems.length, "problem")}`;
}
