import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyShopifyWebhook } from "@/lib/shopify/hmac";

describe("Shopify webhook HMAC", () => {
  const secret = "hush-the-squish";
  const body = JSON.stringify({ id: 1, name: "#1001" });
  const header = crypto.createHmac("sha256", secret).update(body).digest("base64");

  it("accepts a matching signature over the raw body", () => {
    expect(verifyShopifyWebhook(body, header, secret)).toBe(true);
    expect(verifyShopifyWebhook(Buffer.from(body), header, secret)).toBe(true);
  });

  it("rejects a bad secret, a changed body, or a missing header", () => {
    expect(verifyShopifyWebhook(body, header, "other-secret")).toBe(false);
    expect(verifyShopifyWebhook(`${body} `, header, secret)).toBe(false);
    expect(verifyShopifyWebhook(body, "@@@", secret)).toBe(false);
    expect(verifyShopifyWebhook(body, null, secret)).toBe(false);
    expect(verifyShopifyWebhook(body, header, "")).toBe(false);
  });
});
