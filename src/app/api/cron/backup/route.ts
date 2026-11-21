import { exportBackup } from "@/server/backup";

export const runtime = "nodejs";

function allowed(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!allowed(request)) return new Response("Unauthorized", { status: 401 });
  const key = await exportBackup();
  return Response.json({ status: "ok", key });
}
