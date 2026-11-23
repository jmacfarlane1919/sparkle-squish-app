export const REQUIRED_SCOPES = ["write_products", "write_inventory", "write_files", "read_orders", "read_locations"] as const;

const REFRESH_EARLY_MS = 60_000;

export function tokenStillGood(expiresAt: number, now: number) {
  return expiresAt - REFRESH_EARLY_MS > now;
}

export function grantedScopes(scope: string) {
  return scope.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
}

export function missingScopes(scope: string) {
  const have = new Set(grantedScopes(scope));
  return REQUIRED_SCOPES.filter((required) => !have.has(required));
}

export function explainTokenFailure(status: number, body: string) {
  const lower = body.toLowerCase();
  if (lower.includes("app_not_installed")) {
    return "The app is not installed on this store. In the Dev Dashboard, open the app, choose Install app, and install it on mw4ti4-tj.myshopify.com.";
  }
  if (lower.includes("shop_not_permitted")) {
    return "Shopify refused this store. The app and the store have to be in the same organization in the Dev Dashboard, and SHOPIFY_STORE_DOMAIN has to be mw4ti4-tj.myshopify.com.";
  }
  if (lower.includes("invalid_client") || lower.includes("invalid api key") || status === 401) {
    return "Shopify rejected the client id or secret. In Vercel, check SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET match the app's Settings page in the Dev Dashboard.";
  }
  return "Shopify did not give an access token. Release the app version, install the app on the store, and check SHOPIFY_STORE_DOMAIN is mw4ti4-tj.myshopify.com.";
}

export async function requestClientCredentialsToken(input: {
  domain: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  now?: number;
}) {
  const domain = input.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const fetchImpl = input.fetchImpl || fetch;
  let response: Response;
  try {
    response = await fetchImpl(`https://${domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: input.clientId,
        client_secret: input.clientSecret,
      }),
    });
  } catch {
    throw new Error("Could not reach Shopify. Check SHOPIFY_STORE_DOMAIN is mw4ti4-tj.myshopify.com.");
  }
  const raw = await response.text();
  if (!response.ok) throw new Error(explainTokenFailure(response.status, raw));
  let json: { access_token?: string; scope?: string; expires_in?: number };
  try {
    json = JSON.parse(raw) as { access_token?: string; scope?: string; expires_in?: number };
  } catch {
    throw new Error("Shopify sent a token response this app could not read.");
  }
  if (!json.access_token) throw new Error("Shopify did not include an access token.");
  const expiresIn = Number(json.expires_in) > 0 ? Number(json.expires_in) : 86399;
  const now = input.now ?? Date.now();
  return { token: json.access_token, scope: json.scope || "", expiresAt: now + expiresIn * 1000 };
}
