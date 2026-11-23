import { getSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/owner";
import { contentTypeForPhoto, photoRole } from "@/lib/photos/match";
import { friendlyError } from "@/lib/friendly-error";
import { preparePhotoUpload, previewPhotoCsv, recordProductPhoto } from "@/server/photo-import";

export const runtime = "nodejs";
export const maxDuration = 60;

const APP_UPLOAD_LIMIT = 4_000_000;

async function owner() {
  const session = await getSession();
  return Boolean(session && (await isOwnerEmail(session.email)));
}

export async function POST(request: Request) {
  if (!(await owner())) {
    return Response.json({ error: "Only the owner can import photos." }, { status: 403 });
  }
  const action = new URL(request.url).searchParams.get("action");
  try {
    if (action === "preview") {
      const body = (await request.json()) as { csv?: string };
      return Response.json(await previewPhotoCsv(body.csv || ""));
    }
    if (action === "sign") {
      const body = (await request.json()) as { productId?: string; file?: string };
      const contentType = contentTypeForPhoto(body.file || "");
      if (!body.productId || !contentType) return Response.json({ error: "That picture is not a JPG, PNG, WEBP, GIF, or SVG." }, { status: 400 });
      const prepared = await preparePhotoUpload({ productId: body.productId, file: body.file || "", contentType });
      return Response.json({ ...prepared, contentType });
    }
    if (action === "file") {
      const form = await request.formData();
      const file = form.get("file");
      const productId = String(form.get("productId") || "");
      const filename = String(form.get("filename") || "");
      const role = photoRole(String(form.get("role") || ""));
      if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a picture first." }, { status: 400 });
      if (file.size > APP_UPLOAD_LIMIT) {
        return Response.json({ error: `${filename || file.name} is over 4 MB, so it cannot pass through the app. The direct upload to storage has to succeed for a picture that large.` }, { status: 413 });
      }
      const contentType = contentTypeForPhoto(filename || file.name);
      if (!contentType) return Response.json({ error: "Use a JPG, PNG, WEBP, GIF, or SVG." }, { status: 400 });
      const result = await recordProductPhoto({ productId, file: filename || file.name, contentType, role, bytes: Buffer.from(await file.arrayBuffer()) });
      return Response.json({ ok: true, ...result });
    }
    if (action === "commit") {
      const body = (await request.json()) as { productId?: string; file?: string; role?: string };
      const contentType = contentTypeForPhoto(body.file || "");
      if (!body.productId || !contentType) return Response.json({ error: "That picture is not a JPG, PNG, WEBP, GIF, or SVG." }, { status: 400 });
      const result = await recordProductPhoto({
        productId: body.productId,
        file: body.file || "",
        contentType,
        role: photoRole(body.role || ""),
      });
      return Response.json({ ok: true, ...result });
    }
    return Response.json({ error: "Unknown photo import step." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: friendlyError(error) }, { status: 400 });
  }
}
