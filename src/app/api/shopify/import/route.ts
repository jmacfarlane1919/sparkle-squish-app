import { getSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/owner";
import { runImportChunk } from "@/server/shopify-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !(await isOwnerEmail(session.email))) {
    return Response.json({ done: false, error: true, message: "Only the owner can import from Shopify.", productsDone: 0, productsTotal: null }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { fresh?: boolean };
  const result = await runImportChunk({ fresh: Boolean(body.fresh), budgetMs: 20_000, maxSteps: 40 });
  return Response.json(result);
}
