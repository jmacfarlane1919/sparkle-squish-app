"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { commitInvoiceDraft, isOwnerEmail, readInvoiceDraft } from "@/server/invoice-import";
import { go } from "@/server/nav";

export async function commitInvoiceImport(formData: FormData) {
  const session = await getSession();
  if (!session || !isOwnerEmail(session.email)) go("/invoices", { error: "Only the owner can import invoices." });
  const id = String(formData.get("draftId") || "");
  const draft = await readInvoiceDraft(id);
  if (!draft) go("/invoices/import", { error: "That review expired. Upload the CSV and zip again." });
  const choices = new Map<string, string>();
  draft.files.forEach((file, index) => {
    choices.set(file.filename, String(formData.get(`assign:${index}`) ?? ""));
  });
  const result = await commitInvoiceDraft(draft, choices);
  revalidatePath("/invoices");
  revalidatePath("/receive");
  go("/invoices", {
    notice: `Saved ${result.invoices} invoices and attached ${result.attached} files. ${result.skipped} files were left unmatched.`,
  });
}
