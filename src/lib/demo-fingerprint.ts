export const DEMO_SKUS = [
  "SS-SQ-043-STD",
  "SS-SQ-111-STD",
  "SS-SQ-111-STD-1",
  "SS-SQ-014-STD",
  "SS-SQ-028-STD",
  "SS-SQ-007-STD",
  "SS-SQ-052-STD",
  "SS-SQ-044-STD",
  "SS-SQ-061-STD",
  "SS-SQ-096-STD",
  "SS-FG-021-STD",
  "SS-FG-033-STD",
  "SS-FG-008-STD",
  "SS-FG-012-STD",
  "SS-FG-018-STD",
  "SS-FG-044-STD",
  "SS-SL-019-STD",
  "SS-SL-004-STD",
  "SS-SL-027-STD",
  "SS-SL-012-STD",
  "SS-SL-022-STD",
  "SS-SL-031-STD",
  "SS-CY-003-STD",
  "SS-CY-008-STD",
  "SS-GM-011-STD",
  "SS-GM-004-STD",
  "SS-SP-006-STD",
] as const;

export const DEMO_TITLES = [
  "Peach Mochi Bear",
  "Cloud Dumpling",
  "Lavender Loaf",
  "Loaf Sample",
  "Berry Stack",
  "Mint Macaron",
  "Butter Bun",
  "Lemon Mochi",
  "Blueberry Dumpling",
  "Night Market Fox",
  "Clicky Key",
  "Orbit Clicker",
  "Marble Mesh",
  "Pebble Click",
  "Switch Pop",
  "Soda Cap Fidget",
  "Galaxy Pour",
  "Butter Slime Cup",
  "Crystal Crunch",
  "Cloud Slime",
  "Confetti Cup",
  "Rainy Day Slime",
  "Quiet Cube",
  "Soft Prism",
  "Glow Marble",
  "Pocket Marble",
  "Sparkle Putty",
] as const;

export const DEMO_SUPPLIERS = [
  { name: "Mochi Lane", email: "june@mochilane.example" },
  { name: "Fidget Foundry", email: "andre@fidgetfoundry.example" },
  { name: "Slime Studio Co", email: "priya@slimestudio.example" },
  { name: "Soft Seasonals", email: "lila@softseasonals.example" },
  { name: "Neon Noodle Supply", email: "chris@neonnoodle.example" },
] as const;

export const DEMO_PO_NUMBERS = ["PO-1051", "PO-1052", "PO-1053", "PO-1054", "PO-1055", "PO-1056", "PO-1057"] as const;

const skuSet = new Set<string>(DEMO_SKUS);
const titleSet = new Set<string>(DEMO_TITLES);
const poSet = new Set<string>(DEMO_PO_NUMBERS);

export function isDemoSupplier(row: { name: string; email: string; demoSeed?: boolean }) {
  if (row.demoSeed) return true;
  return DEMO_SUPPLIERS.some((supplier) => supplier.name === row.name && supplier.email === row.email);
}

export function isDemoProduct(row: {
  title: string;
  shopifyProductId?: string | null;
  skus: string[];
  shopifyVariantIds?: (string | null)[];
  demoSeed?: boolean;
}) {
  if (row.shopifyProductId) return false;
  if (row.shopifyVariantIds?.some(Boolean)) return false;
  if (row.demoSeed && row.skus.every((sku) => skuSet.has(sku))) return true;
  if (!titleSet.has(row.title)) return false;
  if (!row.skus.length) return false;
  return row.skus.every((sku) => skuSet.has(sku));
}

export function isDemoPurchaseOrder(row: { number: string; supplierIsDemo: boolean; demoSeed?: boolean }) {
  if (row.demoSeed && row.supplierIsDemo) return true;
  return poSet.has(row.number) && row.supplierIsDemo;
}

export function isDemoSale(row: { shopifyOrderId?: string | null; demoSeed?: boolean }) {
  if (row.shopifyOrderId && !row.shopifyOrderId.startsWith("demo-")) return false;
  if (row.demoSeed) return true;
  return Boolean(row.shopifyOrderId?.startsWith("demo-"));
}
