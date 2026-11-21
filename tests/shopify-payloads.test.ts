import { describe, expect, it } from "vitest";
import { assertPayloadSafe } from "@/lib/shopify/guard";
import {
  buildBrandedPhotoOperations,
  buildProductBasicsOperations,
  buildReceiveStockOperation,
  type ProductWriteInput,
} from "@/lib/shopify/payloads";

const vendorSku = "MOCHI-BEAR-PCH";
const vendorBarcode = "810045551203";

function sample(shopifyProductId: string | null): ProductWriteInput {
  return {
    shopifyProductId,
    title: "Peach Mochi Bear",
    description: "A soft peach squishy.",
    status: "active",
    brand: "Mochi Lane",
    texture: "mochi",
    season: "spring",
    size: "palm",
    material: "TPE",
    ageGuidance: "3+",
    newArrival: false,
    receivedAt: "2026-11-01",
    variants: [
      {
        shopifyVariantId: shopifyProductId ? "gid://shopify/ProductVariant/9" : null,
        priceCents: 1400,
        vendorSku,
        vendorBarcode,
        ssSku: "SS-SQ-043-STD",
        ssBarcode: "2000000003474",
        title: "Default Title",
      },
    ],
  };
}

function keysOf(value: unknown, found: string[] = []) {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, found));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      found.push(key);
      keysOf(child, found);
    }
  }
  return found;
}

describe("native vendor identifiers are never written", () => {
  it("keeps vendor SKU and barcode out of create and update payloads", () => {
    for (const input of [sample("gid://shopify/Product/1"), sample(null)]) {
      const operations = buildProductBasicsOperations(input);
      const packed = JSON.stringify(operations);
      expect(packed).not.toContain(vendorSku);
      expect(packed).not.toContain(vendorBarcode);
      expect(packed).toContain("SS-SQ-043-STD");
      expect(packed).toContain("2000000003474");
      expect(packed).toContain("14.00");
      for (const operation of operations) {
        const keys = keysOf(operation.variables);
        expect(keys).not.toContain("sku");
        expect(keys).not.toContain("barcode");
        expect(keys).not.toContain("barcodes");
        expect(operation.query).not.toMatch(/\b(sku|barcode|barcodes)\s*:/);
      }
    }
  });

  it("refuses a payload that tries to set sku, barcode, or barcodes", () => {
    expect(() =>
      assertPayloadSafe({
        name: "bad",
        query: "mutation { ok }",
        variables: { input: { sku: vendorSku } },
      }),
    ).toThrow(/native identifier/);
    expect(() =>
      assertPayloadSafe({
        name: "bad",
        query: "mutation { ok }",
        variables: { variants: [{ barcodes: [vendorBarcode] }] },
      }),
    ).toThrow(/barcode/);
  });

  it("does not put identifiers on stock or photo writes either", () => {
    const stock = buildReceiveStockOperation({
      delta: 2,
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/2",
      referenceDocumentUri: "app://receipts/9",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
    });
    const photos = buildBrandedPhotoOperations({
      filename: "peach.svg",
      mimeType: "image/svg+xml",
      alt: "Peach Mochi Bear",
      existingFileId: null,
    });
    const packed = JSON.stringify([stock, ...photos]);
    expect(packed).not.toContain(vendorSku);
    const stockKeys = keysOf(stock.variables);
      expect(stockKeys).not.toContain("sku");
      expect(stockKeys).not.toContain("barcode");
      expect(stockKeys).not.toContain("barcodes");
    expect(photos.map((operation) => operation.name)).toEqual(["stagedUploadsCreate", "fileCreate"]);
  });
});
