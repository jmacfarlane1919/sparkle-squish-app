import { verifyShopifyWebhook } from "@/lib/shopify/hmac";
import { handleWebhook } from "@/server/shopify-sync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = Buffer.from(await request.arrayBuffer());
  const header = request.headers.get("x-shopify-hmac-sha256");
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || "";
  if (!verifyShopifyWebhook(raw, header, secret)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: unknown = {};
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const topic = request.headers.get("x-shopify-topic") || "";
  const webhookId = request.headers.get("x-shopify-webhook-id") || "";
  try {
    await handleWebhook(topic, body, webhookId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed";
    return new Response(message, { status: 500 });
  }
  return new Response("ok");
}
