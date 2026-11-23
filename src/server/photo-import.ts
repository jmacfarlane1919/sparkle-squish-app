import { rowsToRecords } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { contentTypeForPhoto, matchPhotoRow, photoFileName, photoRole, photoStorageKey, type PhotoMatchRow } from "@/lib/photos/match";
import { hasStoredObject, presignUpload, saveBytes } from "@/lib/storage";

function cell(record: Record<string, string>, key: string) {
  return record[key] || "";
}

export async function previewPhotoCsv(text: string) {
  const rows = rowsToRecords(text);
  const products = await prisma.product.findMany({
    select: { id: true, title: true, shopifyProductId: true, variants: { select: { ssSku: true, vendorSku: true } } },
  });
  const matched: { line: number; file: string; productId: string; productTitle: string; role: "original" | "branded"; via: string }[] = [];
  const unmatched: { line: number; file: string; reason: string }[] = [];
  for (const { line, record } of rows) {
    const file = photoFileName(cell(record, "file"));
    const row: PhotoMatchRow = {
      line,
      file,
      ssSku: cell(record, "ss_sku"),
      vendorSku: cell(record, "vendor_sku"),
      shopifyProductId: cell(record, "shopify_product_id"),
      productTitle: cell(record, "product_title"),
      role: photoRole(cell(record, "role")),
    };
    if (!file) {
      unmatched.push({ line, file: "", reason: "This row needs a file name." });
      continue;
    }
    if (!contentTypeForPhoto(file)) {
      unmatched.push({ line, file, reason: `${file} needs to be a JPG, PNG, WEBP, GIF, or SVG.` });
      continue;
    }
    const hit = matchPhotoRow(row, products);
    if (!hit) unmatched.push({ line, file, reason: `${file} did not match a product.` });
    else matched.push({ line, file, productId: hit.productId, productTitle: hit.productTitle, role: row.role, via: hit.via });
  }
  return {
    matched,
    unmatched,
    summary: `${matched.length} photos matched. ${unmatched.length} rows did not match a product.`,
  };
}

export async function preparePhotoUpload(input: { productId: string; file: string; contentType: string }) {
  const key = photoStorageKey(input.productId, input.file);
  const url = await presignUpload(key, input.contentType);
  return { storageKey: key, url };
}

export async function recordProductPhoto(input: {
  productId: string;
  file: string;
  contentType: string;
  role: "original" | "branded";
  bytes?: Buffer;
}) {
  const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { id: true, title: true } });
  if (!product) throw new Error("That product is not in the catalog.");
  const storageKey = photoStorageKey(product.id, input.file);
  if (input.bytes) await saveBytes(storageKey, input.bytes, input.contentType);
  else if (!(await hasStoredObject(storageKey))) throw new Error(`${photoFileName(input.file)} did not arrive in file storage.`);
  const alt = `${product.title} ${input.role} photo`;
  const existing = await prisma.photo.findFirst({ where: { productId: product.id, storageKey } });
  if (existing) {
    await prisma.photo.update({ where: { id: existing.id }, data: { role: input.role, contentType: input.contentType, alt } });
    return { created: false, storageKey };
  }
  await prisma.photo.create({
    data: { productId: product.id, role: input.role, storageKey, contentType: input.contentType, alt },
  });
  return { created: true, storageKey };
}
