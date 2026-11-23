import { shopifyConfigured, shopifyDomain } from "@/lib/env";
import { getSessionSecret } from "@/lib/env";
import { prisma } from "@/lib/db";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { missingScopes, requestClientCredentialsToken, tokenStillGood } from "@/lib/shopify/credentials";

const KEY = "shopify_oauth";

type Cached = { token: string; scope: string; expiresAt: number };

let memory: Cached | null = null;

export function resetShopifyTokenMemory() {
  memory = null;
}

async function readCache(): Promise<Cached | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as { sealed?: string; scope?: string; expiresAt?: number };
    if (!parsed.sealed || !parsed.expiresAt) return null;
    const token = openSecret(parsed.sealed, getSessionSecret());
    if (!token) return null;
    return { token, scope: parsed.scope || "", expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

async function writeCache(value: Cached) {
  const payload = JSON.stringify({
    sealed: sealSecret(value.token, getSessionSecret()),
    scope: value.scope,
    expiresAt: value.expiresAt,
  });
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: payload },
    update: { value: payload },
  });
}

export async function forgetShopifyToken() {
  memory = null;
  await prisma.appSetting.deleteMany({ where: { key: KEY } });
}

export async function getShopifyAccessToken(options?: { force?: boolean }) {
  const admin = process.env.SHOPIFY_ADMIN_TOKEN || "";
  if (admin) return { token: admin, scope: "", static: true as const };
  const clientId = process.env.SHOPIFY_CLIENT_ID || "";
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new Error("Shopify not connected yet. Add the client id and secret in Vercel.");
  const now = Date.now();
  if (!options?.force && memory && tokenStillGood(memory.expiresAt, now)) {
    return { token: memory.token, scope: memory.scope, static: false as const };
  }
  if (!options?.force) {
    const stored = await readCache();
    if (stored && tokenStillGood(stored.expiresAt, now)) {
      memory = stored;
      return { token: stored.token, scope: stored.scope, static: false as const };
    }
  }
  const fresh = await requestClientCredentialsToken({ domain: shopifyDomain(), clientId, clientSecret });
  memory = fresh;
  await writeCache(fresh);
  return { token: fresh.token, scope: fresh.scope, static: false as const };
}

export async function describeShopifyConnection() {
  if (!shopifyConfigured()) {
    return {
      ok: false,
      headline: "Shopify not connected yet.",
      detail: "Add the client id and client secret from the Dev Dashboard, or paste an admin token.",
    };
  }
  try {
    const auth = await getShopifyAccessToken();
    if (auth.static) {
      return {
        ok: true,
        headline: "Shopify connected",
        detail: "Using the admin token. Permissions are the ones you approved when that app was installed.",
      };
    }
    const granted = auth.scope.split(/[,\s]+/).filter(Boolean).join(", ") || "none reported";
    const missing = missingScopes(auth.scope);
    if (missing.length) {
      return {
        ok: false,
        headline: "Shopify connected, but a permission is missing.",
        detail: `Granted: ${granted}. Missing: ${missing.join(", ")}. Release a new app version that includes the missing ones, then approve the update on the store.`,
      };
    }
    return { ok: true, headline: "Shopify connected", detail: `Permissions: ${granted}.` };
  } catch (error) {
    return {
      ok: false,
      headline: "Shopify is not connected.",
      detail: error instanceof Error ? error.message : "Shopify did not connect.",
    };
  }
}

export function webhookSecret() {
  return process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
}
