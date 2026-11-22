import { headerKey, rowsToRecords } from "@/lib/csv";

export type InvoiceStatus = "open" | "paid";

export type PurchaseOrderRef = {
  id: string;
  number: string;
  invoiceNumber: string;
  supplierName: string;
};

export type SupplierRef = {
  id: string;
  name: string;
};

export type PlannedInvoice = {
  key: string;
  vendor: string;
  invoiceNumber: string;
  date: string;
  status: InvoiceStatus;
  totalCents: number;
  category: string;
  paidFrom: string;
  subtotalCents: number | null;
  discountCents: number | null;
  shippingCents: number | null;
  taxCents: number | null;
  supplierId: string | null;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  collapsedRows: number;
};

export type PlannedFile = {
  filename: string;
  invoiceKey: string | null;
  candidates: string[];
};

export type InvoiceImportPlan = {
  invoices: PlannedInvoice[];
  files: PlannedFile[];
  errors: string[];
  collapsedDuplicates: number;
};

const MIN_MATCH_LENGTH = 4;

/** Drop a leading PO- or 211- (Temu order numbers often carry both) and ignore spaces. */
export function normalizeInvoiceKey(value: string) {
  let text = value.trim().toLowerCase().replace(/\s+/g, "");
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(/^(?:po-|211-)/, "");
  }
  return text;
}

export function normalizeFilename(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/po-/g, "")
    .replace(/211-/g, "");
}

export function invoiceDedupeKey(vendor: string, invoiceNumber: string) {
  return `${vendor.trim().toLowerCase()}|${normalizeInvoiceKey(invoiceNumber)}`;
}

export function parseUsdToCents(value: string) {
  const cleaned = value.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [dollars, fraction = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

export function parseInvoiceDate(value: string) {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !us) return null;
  const year = Number(iso ? iso[1] : us?.[3]);
  const month = Number(iso ? iso[2] : us?.[1]);
  const day = Number(iso ? iso[3] : us?.[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseInvoiceStatus(value: string): InvoiceStatus {
  return value.trim().toLowerCase().startsWith("paid") ? "paid" : "open";
}

export function contentTypeFor(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "application/octet-stream";
}

function field(record: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[headerKey(key)];
    if (value) return value;
  }
  return "";
}

function optionalCents(record: Record<string, string>, ...keys: string[]) {
  const raw = field(record, ...keys);
  if (!raw) return null;
  return parseUsdToCents(raw);
}

export function matchPurchaseOrder(invoiceNumber: string, orders: PurchaseOrderRef[]) {
  const key = normalizeInvoiceKey(invoiceNumber);
  if (key.length < MIN_MATCH_LENGTH) return null;
  const hits = orders.filter((order) =>
    [order.number, order.invoiceNumber].some((value) => value && normalizeInvoiceKey(value) === key),
  );
  if (hits.length === 1) return hits[0];
  const onInvoiceField = hits.filter((order) => order.invoiceNumber && normalizeInvoiceKey(order.invoiceNumber) === key);
  return onInvoiceField.length === 1 ? onInvoiceField[0] : null;
}

function matchSupplier(vendor: string, suppliers: SupplierRef[]) {
  const name = vendor.trim().toLowerCase();
  return suppliers.find((supplier) => supplier.name.trim().toLowerCase() === name) ?? null;
}

export function planInvoiceImport(input: {
  csv: string;
  filenames: string[];
  purchaseOrders: PurchaseOrderRef[];
  suppliers: SupplierRef[];
}): InvoiceImportPlan {
  const errors: string[] = [];
  const byKey = new Map<string, PlannedInvoice>();
  let collapsedDuplicates = 0;
  const rows = rowsToRecords(input.csv);
  if (!rows.length) errors.push("The CSV has no invoice rows.");

  for (const { line, record } of rows) {
    const vendor = field(record, "supplier", "vendor", "vendor_name");
    const invoiceNumber = field(record, "invoice_number", "invoice", "number");
    const date = parseInvoiceDate(field(record, "date", "invoice_date"));
    const totalCents = parseUsdToCents(field(record, "amount_usd", "amount", "total"));
    if (!vendor || !invoiceNumber) {
      errors.push(`Row ${line} needs a supplier and an invoice number.`);
      continue;
    }
    if (!date) {
      errors.push(`Row ${line} has a date this import cannot read.`);
      continue;
    }
    if (totalCents == null) {
      errors.push(`Row ${line} has an amount that is not a dollar value.`);
      continue;
    }
    const key = invoiceDedupeKey(vendor, invoiceNumber);
    const supplier = matchSupplier(vendor, input.suppliers);
    const order = matchPurchaseOrder(invoiceNumber, input.purchaseOrders);
    const next: PlannedInvoice = {
      key,
      vendor: vendor.trim(),
      invoiceNumber: invoiceNumber.trim(),
      date,
      status: parseInvoiceStatus(field(record, "status")),
      totalCents,
      category: field(record, "category"),
      paidFrom: field(record, "paid_from", "paid from"),
      subtotalCents: optionalCents(record, "subtotal"),
      discountCents: optionalCents(record, "discount"),
      shippingCents: optionalCents(record, "shipping"),
      taxCents: optionalCents(record, "tax"),
      supplierId: supplier?.id ?? null,
      purchaseOrderId: order?.id ?? null,
      purchaseOrderNumber: order?.number ?? null,
      collapsedRows: 1,
    };
    const previous = byKey.get(key);
    if (previous) {
      collapsedDuplicates += 1;
      next.collapsedRows = previous.collapsedRows + 1;
      if (!next.paidFrom) next.paidFrom = previous.paidFrom;
      if (next.subtotalCents == null) next.subtotalCents = previous.subtotalCents;
      if (next.discountCents == null) next.discountCents = previous.discountCents;
      if (next.shippingCents == null) next.shippingCents = previous.shippingCents;
      if (next.taxCents == null) next.taxCents = previous.taxCents;
    }
    byKey.set(key, next);
  }

  const invoices = [...byKey.values()];
  const files = input.filenames.map((filename) => matchFile(filename, invoices));
  return { invoices, files, errors, collapsedDuplicates };
}

function matchFile(filename: string, invoices: PlannedInvoice[]): PlannedFile {
  const haystack = normalizeFilename(filename);
  const hits = invoices.filter((invoice) => {
    const needle = normalizeInvoiceKey(invoice.invoiceNumber);
    return needle.length >= MIN_MATCH_LENGTH && haystack.includes(needle);
  });
  const vendorHits = hits.filter((invoice) => {
    const vendor = normalizeFilename(invoice.vendor);
    return vendor.length >= 3 && haystack.includes(vendor);
  });
  const pool = vendorHits.length ? vendorHits : hits;
  const ranked = [...pool].sort(
    (left, right) => normalizeInvoiceKey(right.invoiceNumber).length - normalizeInvoiceKey(left.invoiceNumber).length,
  );
  const best = ranked[0];
  const second = ranked[1];
  const ambiguous =
    Boolean(best && second) &&
    normalizeInvoiceKey(best.invoiceNumber).length === normalizeInvoiceKey(second.invoiceNumber).length &&
    vendorHits.length !== 1;
  return {
    filename,
    invoiceKey: best && !ambiguous ? best.key : null,
    candidates: ranked.map((invoice) => invoice.key),
  };
}

export function assignmentFor(file: PlannedFile, chosen: string | null | undefined, invoiceKeys: Set<string>) {
  if (chosen == null) return file.invoiceKey;
  if (!chosen) return null;
  return invoiceKeys.has(chosen) ? chosen : file.invoiceKey;
}

/** Filenames already stored on an invoice are not attached again. */
export function newAttachmentNames(existing: string[], incoming: string[]) {
  const seen = new Set(existing);
  return incoming.filter((filename) => {
    if (seen.has(filename)) return false;
    seen.add(filename);
    return true;
  });
}
