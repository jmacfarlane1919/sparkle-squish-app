import { SHOP, shopifyConfigured, shopifyDomain } from "@/lib/env";
import { assertPayloadSafe, collectUserErrors, type ShopifyOperation } from "@/lib/shopify/guard";
import { forgetShopifyToken, getShopifyAccessToken } from "@/server/shopify-token";

export async function shopifyGraphql<T>(query: string, variables: Record<string, unknown> = {}, attempt = 0): Promise<T> {
  if (!shopifyConfigured()) {
    throw new Error("Shopify is not connected yet.");
  }
  const auth = await getShopifyAccessToken({ force: attempt > 0 });
  const response = await fetch(`https://${shopifyDomain()}/admin/api/${SHOP.apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": auth.token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await response.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
  const message = json.errors?.map((error) => error.message).join("; ") || "";
  const rejected = response.status === 401 || /invalid api key or access token/i.test(message);
  if (rejected && !auth.static && attempt === 0) {
    await forgetShopifyToken();
    return shopifyGraphql<T>(query, variables, attempt + 1);
  }
  if (!response.ok || json.errors?.length) {
    if (rejected && auth.static) throw new Error("Shopify rejected the admin token in SHOPIFY_ADMIN_TOKEN.");
    if (rejected) throw new Error("Shopify rejected the access token. Check that the app is still installed.");
    throw new Error(message || `Shopify returned ${response.status}`);
  }
  return json.data as T;
}

export async function runShopifyOperation(operation: ShopifyOperation) {
  assertPayloadSafe(operation);
  const data = await shopifyGraphql<Record<string, unknown>>(operation.query, operation.variables);
  const errors = collectUserErrors(data);
  if (errors.length) throw new Error(errors.join("; "));
  return data;
}
