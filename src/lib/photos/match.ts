export type PhotoMatchProduct = {
  id: string;
  title: string;
  shopifyProductId: string | null;
  variants: { ssSku: string; vendorSku: string }[];
};

export type PhotoMatchRow = {
  line: number;
  file: string;
  ssSku: string;
  vendorSku: string;
  shopifyProductId: string;
  productTitle: string;
  role: "original" | "branded";
};

export function photoRole(value: string): "original" | "branded" {
  return value.trim().toLowerCase() === "branded" ? "branded" : "original";
}

export function photoFileName(file: string) {
  const base = file.trim().split(/[/\\]/).pop() || "";
  return base.trim();
}

export function photoStorageKey(productId: string, file: string) {
  const base = photoFileName(file).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `photos/${productId}/${base || "photo"}`;
}

function sameShopifyId(stored: string | null, given: string) {
  const wanted = given.trim();
  if (!stored || !wanted) return false;
  if (stored === wanted) return true;
  return stored.split("/").pop() === wanted.split("/").pop();
}

export function matchPhotoRow(row: PhotoMatchRow, products: PhotoMatchProduct[]) {
  const byId = row.shopifyProductId
    ? products.find((product) => sameShopifyId(product.shopifyProductId, row.shopifyProductId))
    : undefined;
  const bySs = row.ssSku
    ? products.find((product) => product.variants.some((variant) => variant.ssSku.toLowerCase() === row.ssSku.toLowerCase()))
    : undefined;
  const byVendor = row.vendorSku
    ? products.find((product) => product.variants.some((variant) => variant.vendorSku.toLowerCase() === row.vendorSku.toLowerCase()))
    : undefined;
  const product = byId || bySs || byVendor;
  if (!product) return null;
  const via = byId ? "shopify_product_id" : bySs ? "ss_sku" : "vendor_sku";
  return { productId: product.id, productTitle: product.title, via };
}

export function contentTypeForPhoto(file: string) {
  const name = photoFileName(file).toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "";
}
