import { SHOP, shopifyConfigured, shopifyDomain } from "@/lib/env";
import { assertPayloadSafe, collectUserErrors, type ShopifyOperation } from "@/lib/shopify/guard";

export async function shopifyGraphql<T>(query: string, variables: Record<string, unknown> = {}) {
  if (!shopifyConfigured()) {
    throw new Error("Shopify is not connected. Add the admin token in the environment.");
  }
  const response = await fetch(`https://${shopifyDomain()}/admin/api/${SHOP.apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN || "",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (!response.ok || json.errors?.length) {
    const message = json.errors?.map((error) => error.message).join("; ") || `Shopify returned ${response.status}`;
    throw new Error(message);
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
