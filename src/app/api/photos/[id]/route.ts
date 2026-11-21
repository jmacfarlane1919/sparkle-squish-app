import { prisma } from "@/lib/db";
import { readBytes } from "@/lib/storage";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in required.", { status: 401 });
  const { id } = await context.params;
  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) return new Response("Not found", { status: 404 });
  const bytes = await readBytes(photo.storageKey);
  if (!bytes) return new Response("Missing file", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=3600" },
  });
}
