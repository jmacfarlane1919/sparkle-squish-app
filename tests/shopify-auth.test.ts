import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { explainTokenFailure, missingScopes, requestClientCredentialsToken, tokenStillGood } from "@/lib/shopify/credentials";
import { shopifyGraphql } from "@/lib/shopify/client";
import { describeShopifyConnection, forgetShopifyToken, getShopifyAccessToken, resetShopifyTokenMemory, webhookSecret } from "@/server/shopify-token";

const secret = "session-secret-at-least-24-characters";
const token = "shpca_test_token_value";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Shopify client credentials", () => {
  it("asks for a token without sending scopes, and treats it as expired a minute early", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = String(init?.body || "");
      expect(body).toContain("grant_type=client_credentials");
      expect(body).toContain("client_id=cid");
      expect(body).toContain("client_secret=csecret");
      expect(body).not.toContain("scope=");
      return jsonResponse({ access_token: token, scope: "write_products,read_orders", expires_in: 86399 });
    });
    const now = 1_700_000_000_000;
    const result = await requestClientCredentialsToken({
      domain: "https://mw4ti4-tj.myshopify.com/",
      clientId: "cid",
      clientSecret: "csecret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://mw4ti4-tj.myshopify.com/admin/oauth/access_token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.token).toBe(token);
    expect(result.expiresAt).toBe(now + 86399 * 1000);
    expect(tokenStillGood(result.expiresAt, result.expiresAt - 60_000)).toBe(false);
    expect(tokenStillGood(result.expiresAt, result.expiresAt - 60_001)).toBe(true);
  });

  it("turns Shopify's errors into plain English and never echoes the secret", () => {
    const body = "Oauth error app_not_installed: The application is not installed on this shop. client_secret=csecret";
    const message = explainTokenFailure(400, body);
    expect(message).toMatch(/not installed/i);
    expect(message).not.toContain("csecret");
    expect(explainTokenFailure(400, "Oauth error shop_not_permitted")).toMatch(/same organization/i);
    expect(explainTokenFailure(401, "invalid_client")).toMatch(/client id or secret/i);
    expect(missingScopes("write_products,read_orders")).toEqual(["write_inventory", "write_files", "read_locations"]);
    expect(missingScopes("write_products,write_inventory,write_files,read_orders,read_locations")).toEqual([]);
  });

  it("stores the token encrypted and reuses it until it is near expiry", async () => {
    process.env.SESSION_SECRET = secret;
    process.env.SHOPIFY_ADMIN_TOKEN = "";
    process.env.SHOPIFY_CLIENT_ID = "cid";
    process.env.SHOPIFY_CLIENT_SECRET = "csecret";
    process.env.SHOPIFY_STORE_DOMAIN = "example.myshopify.com";
    const realFetch = global.fetch;
    let calls = 0;
    global.fetch = (async () => {
      calls += 1;
      return jsonResponse({ access_token: token, scope: "write_products,write_inventory,write_files,read_orders,read_locations", expires_in: 86399 });
    }) as typeof fetch;
    resetShopifyTokenMemory();
    await forgetShopifyToken();
    try {
      const first = await getShopifyAccessToken();
      const second = await getShopifyAccessToken();
      expect(first.token).toBe(token);
      expect(second.token).toBe(token);
      expect(calls).toBe(1);
      const row = await prisma.appSetting.findUnique({ where: { key: "shopify_oauth" } });
      expect(row?.value).not.toContain(token);
      const stored = JSON.parse(row?.value || "{}") as { sealed: string };
      expect(openSecret(stored.sealed, secret)).toBe(token);
      const status = await describeShopifyConnection();
      expect(status.headline).toBe("Shopify connected");
      expect(status.detail).toContain("write_products");
      expect(status.detail).not.toContain(token);
    } finally {
      global.fetch = realFetch;
      await forgetShopifyToken();
      resetShopifyTokenMemory();
      delete process.env.SHOPIFY_CLIENT_ID;
      delete process.env.SHOPIFY_CLIENT_SECRET;
      delete process.env.SHOPIFY_STORE_DOMAIN;
    }
  });

  it("asks Shopify for a new token when the Admin API returns 401", async () => {
    process.env.SESSION_SECRET = secret;
    process.env.SHOPIFY_ADMIN_TOKEN = "";
    process.env.SHOPIFY_CLIENT_ID = "cid";
    process.env.SHOPIFY_CLIENT_SECRET = "csecret";
    process.env.SHOPIFY_STORE_DOMAIN = "example.myshopify.com";
    const sealed = sealSecret("old-token", secret);
    await prisma.appSetting.upsert({
      where: { key: "shopify_oauth" },
      create: { key: "shopify_oauth", value: JSON.stringify({ sealed, scope: "read_orders", expiresAt: Date.now() + 60 * 60 * 1000 }) },
      update: { value: JSON.stringify({ sealed, scope: "read_orders", expiresAt: Date.now() + 60 * 60 * 1000 }) },
    });
    resetShopifyTokenMemory();
    const realFetch = global.fetch;
    const headers: string[] = [];
    global.fetch = (async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("access_token")) {
        return jsonResponse({
          access_token: "fresh-token",
          scope: "write_products,write_inventory,write_files,read_orders,read_locations",
          expires_in: 86399,
        });
      }
      headers.push(String((init?.headers as Record<string, string>)["X-Shopify-Access-Token"]));
      if (headers.length === 1) return jsonResponse({ errors: [{ message: "Invalid API key or access token" }] }, 401);
      return jsonResponse({ data: { shop: { name: "Sparkle & Squish" } } });
    }) as typeof fetch;
    try {
      const data = await shopifyGraphql<{ shop: { name: string } }>("{ shop { name } }");
      expect(data.shop.name).toBe("Sparkle & Squish");
      expect(headers).toEqual(["old-token", "fresh-token"]);
    } finally {
      global.fetch = realFetch;
      await forgetShopifyToken();
      resetShopifyTokenMemory();
      delete process.env.SHOPIFY_CLIENT_ID;
      delete process.env.SHOPIFY_CLIENT_SECRET;
      delete process.env.SHOPIFY_STORE_DOMAIN;
    }
  });

  it("prefers a saved admin token and uses the client secret for webhooks when no webhook secret is set", async () => {
    process.env.SHOPIFY_ADMIN_TOKEN = "shpat_static";
    process.env.SHOPIFY_CLIENT_ID = "cid";
    process.env.SHOPIFY_CLIENT_SECRET = "csecret";
    const auth = await getShopifyAccessToken();
    expect(auth.token).toBe("shpat_static");
    expect(auth.static).toBe(true);
    delete process.env.SHOPIFY_ADMIN_TOKEN;
    delete process.env.SHOPIFY_WEBHOOK_SECRET;
    process.env.SHOPIFY_CLIENT_SECRET = "csecret";
    expect(webhookSecret()).toBe("csecret");
    process.env.SHOPIFY_WEBHOOK_SECRET = "hook-secret";
    expect(webhookSecret()).toBe("hook-secret");
    delete process.env.SHOPIFY_CLIENT_ID;
    delete process.env.SHOPIFY_CLIENT_SECRET;
    delete process.env.SHOPIFY_WEBHOOK_SECRET;
  });
});
