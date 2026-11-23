import { afterEach, describe, expect, it } from "vitest";
import { ean13FromBody, LAST_ISSUED_BARCODE, seriesMarkAfterImport } from "@/lib/identifiers";
import { explainShopifyReadError, throttleWaitMs } from "@/lib/shopify/client";
import { IMPORT_QUERIES, estimatedQueryCost } from "@/lib/shopify/queries";
import { prisma } from "@/lib/db";
import { describeImportProgress, runImportChunk } from "@/server/shopify-sync";

const low = ean13FromBody("200000000200");
const high = ean13FromBody("200000000310");

const catalog = [
  {
    id: "gid://shopify/Product/test-a",
    title: "Import Peach",
    variants: [
      {
        id: "gid://shopify/ProductVariant/test-a",
        title: "Default",
        sku: "V-A",
        price: "14.00",
        inventoryItem: { id: "gid://shopify/InventoryItem/test-a", unitCost: { amount: "5.25" } },
        ssSku: { value: "SS-SQ-043-STD" },
        ssBarcode: { value: low },
        barcodes: { nodes: [] },
      },
    ],
  },
  {
    id: "gid://shopify/Product/test-b",
    title: "Import Click",
    variants: [
      {
        id: "gid://shopify/ProductVariant/test-b",
        title: "Default",
        sku: "V-B",
        price: "9.00",
        inventoryItem: { id: "gid://shopify/InventoryItem/test-b", unitCost: { amount: "2.75" } },
        ssSku: { value: "SS-FG-021-STD" },
        ssBarcode: { value: high },
        barcodes: { nodes: [] },
      },
    ],
  },
];

function fakeRead(query: string, variables: Record<string, unknown> = {}) {
  if (query.includes("productsCount")) return { productsCount: { count: catalog.length } };
  if (query.includes("ordersCount")) return { ordersCount: { count: 0 } };
  if (query.includes("locations(")) {
    return {
      locations: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [{ id: "gid://shopify/Location/test-aisle", name: "Import Test Aisle", isActive: true }],
      },
    };
  }
  if (query.includes("products(first:")) {
    return {
      products: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: catalog.map((product) => ({ id: product.id, title: product.title, description: "", status: "ACTIVE", vendor: "Mochi Lane" })),
      },
    };
  }
  if (query.includes("variants(first:")) {
    const product = catalog.find((item) => item.id === variables.id);
    return { product: { variants: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: product?.variants || [] } } };
  }
  if (query.includes("inventoryLevels")) {
    const ids = Array.isArray(variables.ids) ? variables.ids : [];
    return {
      nodes: ids.map((id) => ({
        id,
        inventoryLevels: {
          nodes: [{ location: { id: "gid://shopify/Location/test-aisle", name: "Import Test Aisle" }, quantities: [{ name: "available", quantity: 4 }] }],
        },
      })),
    };
  }
  if (query.includes("orders(first:")) return { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } };
  throw new Error(`Unexpected Shopify read: ${query.slice(0, 60)}`);
}

describe("Shopify import stays small and resumable", () => {
  afterEach(async () => {
    await prisma.product.deleteMany({ where: { shopifyProductId: { in: catalog.map((product) => product.id) } } });
    await prisma.location.deleteMany({ where: { shopifyLocationId: "gid://shopify/Location/test-aisle" } });
    await prisma.appSetting.deleteMany({ where: { key: { in: ["shopify_import_job", "shopify_synced_at"] } } });
  });

  it("keeps every import query under the cost cap and reads the S&S metafields", () => {
    for (const query of IMPORT_QUERIES) {
      expect(query).not.toMatch(/\bmutation\b/);
      expect(estimatedQueryCost(query)).toBeLessThan(800);
    }
    const variants = IMPORT_QUERIES.find((query) => query.includes("s_s_sku")) || "";
    expect(variants).toContain('key: "s_s_barcode"');
    expect(variants).not.toContain("inventoryLevels");
    expect(IMPORT_QUERIES.find((query) => query.includes("products(first:"))).not.toContain("variants(");
  });

  it("hides the raw cost error and pauses when Shopify is low on budget", () => {
    const message = explainShopifyReadError("Query cost is 1580, which exceeds the single query max cost limit (1000)");
    expect(message).not.toContain("1580");
    expect(message).toMatch(/too big/i);
    expect(throttleWaitMs({ currentlyAvailable: 50, restoreRate: 100 })).toBe(1500);
    expect(throttleWaitMs({ currentlyAvailable: 500, restoreRate: 100 })).toBe(0);
  });

  it("moves the barcode series back to the real Shopify maximum when the app has not issued one", () => {
    const mark = seriesMarkAfterImport({
      current: LAST_ISSUED_BARCODE,
      shopifyBarcodes: [low, high, "not-a-barcode"],
      appIssuedBarcodes: [],
    });
    expect(mark.lowered).toBe(true);
    expect(mark.lastIssued).toBe(high);
    expect(mark.note).toContain(high);
    const kept = seriesMarkAfterImport({
      current: LAST_ISSUED_BARCODE,
      shopifyBarcodes: [low],
      appIssuedBarcodes: [LAST_ISSUED_BARCODE],
    });
    expect(kept.lowered).toBe(false);
    expect(kept.lastIssued).toBe(LAST_ISSUED_BARCODE);
  });

  it("imports a page at a time and says how many products are in", async () => {
    const previousToken = process.env.SHOPIFY_ADMIN_TOKEN;
    const previousDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const previousCounter = await prisma.barcodeCounter.findUnique({ where: { id: "series" } });
    process.env.SHOPIFY_ADMIN_TOKEN = "shpat_test";
    process.env.SHOPIFY_STORE_DOMAIN = "example.myshopify.com";
    await prisma.barcodeCounter.upsert({
      where: { id: "series" },
      update: { lastIssued: LAST_ISSUED_BARCODE },
      create: { id: "series", lastIssued: LAST_ISSUED_BARCODE },
    });
    const seen: string[] = [];
    try {
      let result = { done: false, message: "" };
      for (let step = 0; step < 12 && !result.done; step += 1) {
        result = await runImportChunk({
          fresh: step === 0,
          maxSteps: 1,
          budgetMs: 10_000,
          read: fakeRead as unknown as typeof import("@/lib/shopify/client").shopifyGraphql,
        });
        seen.push(result.message);
      }
      expect(seen).toContain("Imported 1 of 2 products...");
      expect(result.done).toBe(true);
      expect(result.message).toContain("Import finished");
      expect(result.message).toContain(high);
      const saved = await prisma.variant.findFirst({ where: { shopifyVariantId: "gid://shopify/ProductVariant/test-b" } });
      expect(saved?.ssBarcode).toBe(high);
      expect(saved?.ssSku).toBe("SS-FG-021-STD");
      const counter = await prisma.barcodeCounter.findUnique({ where: { id: "series" } });
      expect(counter?.lastIssued).toBe(high);
      expect(describeImportProgress({ phase: "products", productsDone: 120, productsTotal: 339, ordersDone: 0, ordersTotal: null, note: "" })).toBe("Imported 120 of 339 products...");
    } finally {
      if (previousCounter) {
        await prisma.barcodeCounter.update({ where: { id: "series" }, data: { lastIssued: previousCounter.lastIssued } });
      }
      process.env.SHOPIFY_ADMIN_TOKEN = previousToken;
      process.env.SHOPIFY_STORE_DOMAIN = previousDomain;
    }
  });
});
