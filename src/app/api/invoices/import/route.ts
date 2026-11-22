import { getSession } from "@/lib/auth";
import { createInvoiceDraft, isOwnerEmail } from "@/server/invoice-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !isOwnerEmail(session.email)) {
    return new Response("Only the owner can import invoices.", { status: 403 });
  }
  const form = await request.formData();
  const csvFile = form.get("csv");
  const zipFile = form.get("zip");
  if (!(csvFile instanceof File) || !csvFile.size) {
    return Response.redirect(new URL("/invoices/import?error=Add+the+invoice+CSV.", request.url));
  }
  if (!(zipFile instanceof File) || !zipFile.size) {
    return Response.redirect(new URL("/invoices/import?error=Add+the+zip+of+invoice+files.", request.url));
  }
  const csv = await csvFile.text();
  const zip = new Uint8Array(await zipFile.arrayBuffer());
  try {
    const draft = await createInvoiceDraft(csv, zip);
    return Response.redirect(new URL(`/invoices/import/${draft.id}`, request.url), 303);
  } catch {
    return Response.redirect(new URL("/invoices/import?error=That+zip+could+not+be+opened.", request.url));
  }
}
