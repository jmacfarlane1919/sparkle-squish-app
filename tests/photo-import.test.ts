import { describe, expect, it } from "vitest";
import { contentTypeForPhoto, matchPhotoRow, photoRole, photoStorageKey } from "@/lib/photos/match";

const products = [
  {
    id: "peach",
    title: "Peach Mochi Bear",
    shopifyProductId: "gid://shopify/Product/111",
    variants: [{ ssSku: "SS-SQ-043-STD", vendorSku: "MOCHI-BEAR-PCH" }],
  },
  {
    id: "click",
    title: "Clicky Key",
    shopifyProductId: "gid://shopify/Product/222",
    variants: [{ ssSku: "SS-FG-021-STD", vendorSku: "CLICK-KEY" }],
  },
];

const blank = { line: 2, file: "peach.jpg", ssSku: "", vendorSku: "", shopifyProductId: "", productTitle: "", role: "original" as const };

describe("product photo matching", () => {
  it("matches shopify id first, then S&S SKU, then supplier SKU", () => {
    expect(matchPhotoRow({ ...blank, shopifyProductId: "111", ssSku: "SS-FG-021-STD" }, products)?.productId).toBe("peach");
    expect(matchPhotoRow({ ...blank, ssSku: "ss-fg-021-std", vendorSku: "MOCHI-BEAR-PCH" }, products)?.productId).toBe("click");
    expect(matchPhotoRow({ ...blank, vendorSku: "click-key" }, products)).toEqual({ productId: "click", productTitle: "Clicky Key", via: "vendor_sku" });
    expect(matchPhotoRow({ ...blank, productTitle: "Peach Mochi Bear" }, products)).toBeNull();
  });

  it("defaults the role to original and keeps the same storage name for the same file", () => {
    expect(photoRole("")).toBe("original");
    expect(photoRole("Branded")).toBe("branded");
    expect(photoStorageKey("peach", "photos/Peach Bear.jpg")).toBe(photoStorageKey("peach", "Peach Bear.jpg"));
    expect(contentTypeForPhoto("peach.jpg")).toBe("image/jpeg");
    expect(contentTypeForPhoto("notes.txt")).toBe("");
  });
});
