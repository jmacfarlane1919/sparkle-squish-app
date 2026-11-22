import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readBytes } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in required.", { status: 401 });
  const { id } = await context.params;
  const file = await prisma.invoiceAttachment.findUnique({ where: { id } });
  if (!file) return new Response("That file is gone.", { status: 404 });
  const bytes = await readBytes(file.storageKey);
  if (!bytes) return new Response("That file is missing from storage.", { status: 404 });
  const filename = file.filename.replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
