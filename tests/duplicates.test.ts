import { describe, expect, it } from "vitest";
import { groupDuplicateProducts, type DuplicateCandidate } from "@/lib/catalog/duplicates";
import { allocateProductSku } from "@/lib/identifiers";
import { prisma } from "@/lib/db";
import { findDuplicateProducts, removeDuplicateProducts } from "@/server/dedupe-products";

function row(patch: Partial<DuplicateCandidate> & Pick<DuplicateCandidate, "productId" | "createdAt" | "references">): DuplicateCandidate {
  return {
    title: "Speks Gump Loop Dew",
    supplierId: "speks",
    supplierName: "Speks",
    vendorSku: "GumpLoopDew",
    vendorBarcode: "012345678905",
    shopifyProductId: null,
    ssSku: "SS-SQ-368-STD",
    ssBarcode: "2000000003467",
    variantIds: [patch.productId],
    keepVariantId: patch.productId,
    ...patch,
  };
}

describe("duplicate app-only products", () => {
  it("keeps the copy with more history, otherwise the older one, and ignores Shopify products", () => {
    const groups = groupDuplicateProducts([
      row({ productId: "older", createdAt: 1, references: 1, ssSku: "SS-SQ-368-STD" }),
      row({ productId: "newer", createdAt: 2, references: 0, ssSku: "SS-SQ-412-STD" }),
      row({ productId: "shop", createdAt: 3, references: 9, shopifyProductId: "gid://shopify/Product/1", ssSku: "SS-SQ-100-STD" }),
      row({ productId: "other-name", createdAt: 4, references: 0, title: "Something else", ssSku: "SS-SQ-200-STD" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].keep.ssSku).toBe("SS-SQ-368-STD");
    expect(groups[0].remove.map((copy) => copy.ssSku)).toEqual(["SS-SQ-412-STD"]);
    const tied = groupDuplicateProducts([
      row({ productId: "older", createdAt: 1, references: 0, ssSku: "SS-SQ-368-STD" }),
      row({ productId: "newer", createdAt: 2, references: 0, ssSku: "SS-SQ-412-STD" }),
    ]);
    expect(tied[0].keep.productId).toBe("older");
  });

  it("does not give a retired S&S SKU out again", () => {
    const next = allocateProductSku("SQ", ["SS-SQ-368-STD", "SS-SQ-412-STD"], "STD");
    expect(next).toBe("SS-SQ-413-STD");
  });

  it("moves a photo onto the kept copy and leaves the barcode series alone", async () => {
    const supplier = await prisma.supplier.create({ data: { name: "Dedupe Speks Test" } });
    const older = await prisma.product.create({
      data: {
        title: "Dedupe Gump Loop",
        supplierId: supplier.id,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        variants: { create: { vendorSku: "GumpLoopTest", vendorBarcode: "DEDUPETEST", ssSku: "SS-SQ-968-STD", ssBarcode: "2000000096806" } },
      },
    });
    const newer = await prisma.product.create({
      data: {
        title: "Dedupe Gump Loop",
        supplierId: supplier.id,
        createdAt: new Date("2026-02-01T00:00:00Z"),
        variants: { create: { vendorSku: "GumpLoopTest", vendorBarcode: "DEDUPETEST", ssSku: "SS-SQ-969-STD", ssBarcode: "2000000096813" } },
      },
    });
    await prisma.photo.create({ data: { productId: newer.id, role: "original", storageKey: `photos/${newer.id}/dedupe.jpg`, contentType: "image/jpeg" } });
    const before = await prisma.barcodeCounter.findUnique({ where: { id: "series" } });
    const retiredBefore = await prisma.appSetting.findUnique({ where: { key: "retired_codes" } });
    try {
      const groups = await findDuplicateProducts();
      const group = groups.find((item) => item.vendorSku === "GumpLoopTest");
      expect(group?.keep.productId).toBe(newer.id);
      expect(group?.remove.map((copy) => copy.ssSku)).toEqual(["SS-SQ-968-STD"]);
      const result = await removeDuplicateProducts([older.id, newer.id]);
      expect(result.removed).toBe(1);
      const photo = await prisma.photo.findFirst({ where: { storageKey: `photos/${newer.id}/dedupe.jpg` } });
      expect(photo?.productId).toBe(newer.id);
      expect(await prisma.product.findUnique({ where: { id: older.id } })).toBeNull();
      const after = await prisma.barcodeCounter.findUnique({ where: { id: "series" } });
      expect(after?.lastIssued).toBe(before?.lastIssued);
      const retired = await prisma.appSetting.findUnique({ where: { key: "retired_codes" } });
      expect(retired?.value).toContain("SS-SQ-968-STD");
    } finally {
      await prisma.photo.deleteMany({ where: { storageKey: `photos/${newer.id}/dedupe.jpg` } });
      await prisma.product.deleteMany({ where: { id: { in: [older.id, newer.id] } } });
      await prisma.supplier.delete({ where: { id: supplier.id } });
      if (retiredBefore) await prisma.appSetting.update({ where: { key: "retired_codes" }, data: { value: retiredBefore.value } });
      else await prisma.appSetting.deleteMany({ where: { key: "retired_codes" } });
    }
  });
});
