import { reconcile } from "@/server/shopify-sync";

export const runtime = "nodejs";

function allowed(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!allowed(request)) return new Response("Unauthorized", { status: 401 });
  const result = await reconcile("cron");
  return Response.json(result);
}
