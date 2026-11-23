export type DuplicateCandidate = {
  productId: string;
  title: string;
  supplierId: string | null;
  supplierName: string;
  vendorSku: string;
  vendorBarcode: string;
  shopifyProductId: string | null;
  ssSku: string;
  ssBarcode: string;
  createdAt: number;
  references: number;
  variantIds: string[];
  keepVariantId: string;
};

export type DuplicateGroup = {
  title: string;
  supplierName: string;
  vendorSku: string;
  vendorBarcode: string;
  keep: DuplicateCandidate;
  remove: DuplicateCandidate[];
};

function norm(value: string) {
  return value.trim().toLowerCase();
}

function sameIdentity(left: DuplicateCandidate, right: DuplicateCandidate) {
  if ((left.supplierId || "") !== (right.supplierId || "")) return false;
  if (norm(left.title) !== norm(right.title)) return false;
  const sku = norm(left.vendorSku) && norm(left.vendorSku) === norm(right.vendorSku);
  const barcode = norm(left.vendorBarcode) && norm(left.vendorBarcode) === norm(right.vendorBarcode);
  return Boolean(sku || barcode);
}

function prefer(left: DuplicateCandidate, right: DuplicateCandidate) {
  if (left.references !== right.references) return left.references > right.references ? left : right;
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? left : right;
  return left.productId < right.productId ? left : right;
}

export function groupDuplicateProducts(rows: DuplicateCandidate[]): DuplicateGroup[] {
  const eligible = rows.filter((row) => !row.shopifyProductId && (row.vendorSku.trim() || row.vendorBarcode.trim()));
  const parent = eligible.map((_, index) => index);
  function find(index: number): number {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  }
  for (let left = 0; left < eligible.length; left += 1) {
    for (let right = left + 1; right < eligible.length; right += 1) {
      if (!sameIdentity(eligible[left], eligible[right])) continue;
      parent[find(left)] = find(right);
    }
  }
  const buckets = new Map<number, DuplicateCandidate[]>();
  eligible.forEach((row, index) => {
    const root = find(index);
    buckets.set(root, [...(buckets.get(root) || []), row]);
  });
  const groups: DuplicateGroup[] = [];
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const keep = members.reduce(prefer);
    groups.push({
      title: keep.title,
      supplierName: keep.supplierName || "No supplier",
      vendorSku: keep.vendorSku,
      vendorBarcode: keep.vendorBarcode,
      keep,
      remove: members.filter((row) => row.productId !== keep.productId).sort((a, b) => a.createdAt - b.createdAt),
    });
  }
  return groups.sort((a, b) => a.title.localeCompare(b.title));
}
