import { describe, expect, it } from "vitest";
import { friendlyError } from "@/lib/friendly-error";
import { shouldLoadDemo } from "@/lib/env";
import { isDemoProduct, isDemoPurchaseOrder, isDemoSale, isDemoSupplier } from "@/lib/demo-fingerprint";
import { rethrowNavigation } from "@/server/nav";

describe("live site guards", () => {
  it("does not show redirect codes as an error message", () => {
    const error = new Error("NEXT_REDIRECT");
    expect(friendlyError(error)).not.toContain("NEXT_REDIRECT");
    expect(friendlyError(Object.assign(new Error("boom"), { name: "NoSuchBucket" }))).toMatch(/bucket/i);
    expect(friendlyError(Object.assign(new Error("nope"), { name: "SignatureDoesNotMatch" }))).toMatch(/keys were rejected/i);
    expect(friendlyError(Object.assign(new Error("getaddrinfo ENOTFOUND"), { name: "NetworkingError" }))).toMatch(/storage address/i);
  });

  it("rethrows a Next redirect instead of treating it as a failure", () => {
    const error = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/accounting/expenses/1;307;" });
    expect(() => rethrowNavigation(error)).toThrow(error);
  });

  it("loads the sample shop only for a local demo or DEMO_MODE=true", () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = { node: env.NODE_ENV, demo: env.DEMO_MODE, vercel: env.VERCEL };
    env.DEMO_MODE = "";
    env.VERCEL = "";
    env.NODE_ENV = "development";
    expect(shouldLoadDemo()).toBe(true);
    env.NODE_ENV = "production";
    env.VERCEL = "1";
    expect(shouldLoadDemo()).toBe(false);
    env.DEMO_MODE = "true";
    expect(shouldLoadDemo()).toBe(true);
    env.DEMO_MODE = "false";
    env.NODE_ENV = "development";
    env.VERCEL = "";
    expect(shouldLoadDemo()).toBe(false);
    env.NODE_ENV = previous.node;
    env.DEMO_MODE = previous.demo;
    env.VERCEL = previous.vercel;
  });

  it("recognizes sample products and leaves Shopify-linked products alone", () => {
    expect(isDemoSupplier({ name: "Mochi Lane", email: "june@mochilane.example" })).toBe(true);
    expect(isDemoSupplier({ name: "Mochi Lane", email: "real@sparklesquish.shop" })).toBe(false);
    expect(isDemoProduct({ title: "Peach Mochi Bear", skus: ["SS-SQ-043-STD"], shopifyProductId: null, shopifyVariantIds: [null] })).toBe(true);
    expect(isDemoProduct({ title: "Peach Mochi Bear", skus: ["SS-SQ-043-STD"], shopifyProductId: "gid://shopify/Product/1", shopifyVariantIds: [null] })).toBe(false);
    expect(isDemoProduct({ title: "My real squish", skus: ["SS-SQ-999-STD"], shopifyProductId: null })).toBe(false);
    expect(isDemoPurchaseOrder({ number: "PO-1054", supplierIsDemo: true })).toBe(true);
    expect(isDemoPurchaseOrder({ number: "PO-2000", supplierIsDemo: true })).toBe(false);
    expect(isDemoSale({ shopifyOrderId: "demo-4821" })).toBe(true);
    expect(isDemoSale({ shopifyOrderId: "gid://shopify/Order/9" })).toBe(false);
  });
});
