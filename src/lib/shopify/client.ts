import { SHOP, shopifyConfigured, shopifyDomain } from "@/lib/env";
import { assertPayloadSafe, collectUserErrors, type ShopifyOperation } from "@/lib/shopify/guard";
import { forgetShopifyToken, getShopifyAccessToken } from "@/server/shopify-token";

type Throttle = { currentlyAvailable?: number; restoreRate?: number };

export function explainShopifyReadError(message: string, status = 0) {
  if (/max cost|query cost|exceeds the single query/i.test(message)) {
    return "Shopify said that read was too big. The import uses a smaller page. Press Continue.";
  }
  if (status === 429 || /throttl/i.test(message)) {
    return "Shopify asked for a short pause. Press Continue in a moment.";
  }
  if (/access denied|not approved|required access|access scope/i.test(message)) {
    return "Shopify refused that read. The app version needs read_products, read_inventory, read_orders, and read_locations, and the store has to approve them.";
  }
  return "Shopify could not finish that read. Press Continue in a moment.";
}

export function throttleWaitMs(throttle: Throttle | null | undefined) {
  const available = throttle?.currentlyAvailable;
  const rate = throttle?.restoreRate || 0;
  if (available == null || available >= 200 || rate <= 0) return 0;
  return Math.min(4000, Math.ceil(((200 - available) / rate) * 1000));
}

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
  const json = (await response.json().catch(() => ({}))) as {
    data?: T;
    errors?: { message: string; extensions?: { code?: string } }[];
    extensions?: { cost?: { throttleStatus?: Throttle } };
  };
  const message = json.errors?.map((error) => error.message).join("; ") || "";
  const rejected = response.status === 401 || /invalid api key or access token/i.test(message);
  if (rejected && !auth.static && attempt === 0) {
    await forgetShopifyToken();
    return shopifyGraphql<T>(query, variables, attempt + 1);
  }
  const throttled = response.status === 429 || json.errors?.some((error) => error.extensions?.code === "THROTTLED" || /throttl/i.test(error.message));
  if (throttled && attempt < 2) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return shopifyGraphql<T>(query, variables, attempt + 1);
  }
  if (!response.ok || json.errors?.length) {
    if (rejected && auth.static) throw new Error("Shopify rejected the admin token in SHOPIFY_ADMIN_TOKEN.");
    if (rejected) throw new Error("Shopify rejected the access token. Check that the app is still installed.");
    throw new Error(explainShopifyReadError(message || `Shopify returned ${response.status}`, response.status));
  }
  const wait = throttleWaitMs(json.extensions?.cost?.throttleStatus);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  return json.data as T;
}

export async function runShopifyOperation(operation: ShopifyOperation) {
  assertPayloadSafe(operation);
  const data = await shopifyGraphql<Record<string, unknown>>(operation.query, operation.variables);
  const errors = collectUserErrors(data);
  if (errors.length) throw new Error(errors.join("; "));
  return data;
}
