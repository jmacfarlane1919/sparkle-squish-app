const SKU_PATTERN = /^SS-([A-Z0-9]+)-(\d+)-([A-Z0-9]+)(?:-(\d+))?$/;

export const LAST_ISSUED_BARCODE = "2000000003467";
export const NEXT_FREE_BARCODE = "2000000003474";

export function normalizeCategory(code: string) {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!clean || clean.length > 6) {
    throw new Error("A category code is 1 to 6 letters or numbers.");
  }
  return clean;
}

export function normalizeVariantCode(value: string) {
  const clean = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.slice(0, 8) || "STD";
}

export function formatSsSku(category: string, number: number, variantCode: string, copy?: number | null) {
  if (!Number.isInteger(number) || number < 1) {
    throw new Error("The S&S product number has to be 1 or higher.");
  }
  const cat = normalizeCategory(category);
  const code = normalizeVariantCode(variantCode);
  const num = String(number).padStart(3, "0");
  const base = `SS-${cat}-${num}-${code}`;
  if (copy && copy > 0) return `${base}-${copy}`;
  return base;
}

export function parseSsSku(sku: string) {
  const match = sku.trim().toUpperCase().match(SKU_PATTERN);
  if (!match) return null;
  return {
    category: match[1],
    number: Number(match[2]),
    variantCode: match[3],
    copy: match[4] ? Number(match[4]) : null,
  };
}

export function maxCategoryNumber(category: string, skus: Iterable<string>) {
  const cat = normalizeCategory(category);
  let max = 0;
  for (const sku of skus) {
    const parsed = parseSsSku(sku);
    if (parsed && parsed.category === cat) max = Math.max(max, parsed.number);
  }
  return max;
}

export function allocateUniqueSku(category: string, number: number, variantCode: string, existing: Iterable<string>) {
  const taken = new Set(Array.from(existing, (sku) => sku.toUpperCase()));
  const base = formatSsSku(category, number, variantCode);
  if (!taken.has(base)) return base;
  for (let copy = 1; copy <= 999; copy += 1) {
    const candidate = formatSsSku(category, number, variantCode, copy);
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("This product already has too many copies of that variant code.");
}

export function allocateProductSku(category: string, existing: Iterable<string>, variantCode = "STD") {
  const nextNumber = maxCategoryNumber(category, existing) + 1;
  return allocateUniqueSku(category, nextNumber, variantCode, existing);
}

export function ean13CheckDigit(first12: string) {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error("An EAN-13 body is 12 digits.");
  }
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    const digit = first12.charCodeAt(index) - 48;
    sum += digit * (index % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function ean13FromBody(first12: string) {
  return `${first12}${ean13CheckDigit(first12)}`;
}

export function isValidEan13(code: string) {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

export function nextEan13(current: string) {
  if (!isValidEan13(current)) {
    throw new Error("Cannot continue the barcode series from an invalid code.");
  }
  const body = BigInt(current.slice(0, 12)) + 1n;
  const first12 = body.toString().padStart(12, "0");
  if (first12.length !== 12) throw new Error("The in-store barcode series is exhausted.");
  return ean13FromBody(first12);
}

export function allocateBarcode(lastIssued: string, existing: Iterable<string>) {
  const taken = new Set(existing);
  let cursor = lastIssued;
  for (let step = 0; step < 10000; step += 1) {
    cursor = nextEan13(cursor);
    if (!cursor.startsWith("2")) {
      throw new Error("The next barcode left the in-store 2-prefix range.");
    }
    if (!taken.has(cursor)) return cursor;
  }
  throw new Error("No free S&S barcode is left in the series.");
}

export function laterBarcode(left: string, right: string) {
  const leftOk = isValidEan13(left);
  const rightOk = isValidEan13(right);
  if (!leftOk) return right;
  if (!rightOk) return left;
  return BigInt(left.slice(0, 12)) >= BigInt(right.slice(0, 12)) ? left : right;
}

export function barcodeValues(variant: { ssBarcode?: string; vendorBarcode?: string; otherBarcodes?: string }) {
  const extras = (variant.otherBarcodes || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [variant.ssBarcode || "", variant.vendorBarcode || "", ...extras].filter(Boolean);
}

export type MatchField = "ss_barcode" | "vendor_barcode" | "ss_sku" | "vendor_sku";

export function matchField(variant: {
  ssBarcode: string;
  vendorBarcode: string;
  otherBarcodes: string;
  ssSku: string;
  vendorSku: string;
}, code: string): MatchField | null {
  const query = code.trim();
  if (!query) return null;
  if (variant.ssBarcode && variant.ssBarcode === query) return "ss_barcode";
  if (variant.vendorBarcode && variant.vendorBarcode === query) return "vendor_barcode";
  const extras = variant.otherBarcodes.split(",").map((value) => value.trim());
  if (extras.includes(query)) return "vendor_barcode";
  const sku = query.toUpperCase();
  if (variant.ssSku && variant.ssSku.toUpperCase() === sku) return "ss_sku";
  if (variant.vendorSku && variant.vendorSku.toUpperCase() === sku) return "vendor_sku";
  return null;
}

export function matchLabel(field: MatchField) {
  switch (field) {
    case "ss_barcode":
      return "S&S barcode";
    case "vendor_barcode":
      return "supplier barcode";
    case "ss_sku":
      return "S&S SKU";
    case "vendor_sku":
      return "supplier SKU";
  }
}
