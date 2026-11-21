import { getSession } from "@/lib/auth";
import { renderLabels } from "@/lib/labels/render";
import type { PrintedLabel } from "@/lib/labels/render";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in required.", { status: 401 });
  const { id } = await context.params;
  const job = await prisma.labelPrintJob.findUnique({ where: { id } });
  if (!job) return new Response("That print batch is gone.", { status: 404 });
  const snapshot = JSON.parse(job.snapshot) as PrintedLabel[];
  const pdf = await renderLabels(snapshot, job.size);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ss-labels-${id.slice(-6)}.pdf"`,
    },
  });
}
