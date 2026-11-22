import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { commitInvoiceImport } from "@/server/actions/invoices";
import { isOwnerEmail, readInvoiceDraft } from "@/server/invoice-import";

const selectClass = "mt-1 h-11 w-full rounded-2xl border border-[#e4dced] bg-white px-3 text-sm";

export default async function InvoiceReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isOwnerEmail(session.email)) notFound();
  const { id } = await params;
  const draft = await readInvoiceDraft(id);
  if (!draft) notFound();
  const byKey = new Map(draft.invoices.map((invoice) => [invoice.key, invoice]));
  const matched = draft.files.filter((file) => file.invoiceKey).length;
  const unmatched = draft.files.length - matched;
  const linked = draft.invoices.filter((invoice) => invoice.purchaseOrderId).length;

  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/invoices/import">Import</BackLink>
      <PageIntro
        title="Review import"
        subtitle="Nothing is saved yet. Check the matches, assign any leftover files, then import."
      />
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat value={draft.invoices.length} label="Invoices" />
        <Stat value={matched} label="Files matched" />
        <Stat value={unmatched} label="Need a look" />
      </div>
      <p className="mb-4 text-sm text-[#8a8496]">
        {linked} linked to a purchase order.
        {draft.collapsedDuplicates ? ` ${draft.collapsedDuplicates} duplicate rows were folded into the invoice above them.` : ""}
      </p>
      {draft.errors.length ? (
        <ul className="mb-4 space-y-1 rounded-2xl bg-[#fde8ef] px-4 py-3 text-sm text-[#8d2d52]">
          {draft.errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      ) : null}
      <form action={commitInvoiceImport} className="space-y-3">
        <input type="hidden" name="draftId" value={draft.id} />
        {draft.invoices.map((invoice) => {
          const files = draft.files.filter((file) => file.invoiceKey === invoice.key);
          return (
            <section key={invoice.key} className="rounded-[22px] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold">{invoice.vendor}</p>
                  <p className="text-sm">{invoice.invoiceNumber}</p>
                </div>
                <p className="text-sm font-extrabold">{formatMoney(invoice.totalCents)}</p>
              </div>
              <p className="mt-1 text-xs text-[#8a8496]">
                {invoice.date} · {invoice.status}
                {invoice.category ? ` · ${invoice.category}` : ""}
                {invoice.collapsedRows > 1 ? ` · ${invoice.collapsedRows} CSV rows` : ""}
              </p>
              <p className="mt-1 text-xs text-[#8a8496]">
                {invoice.purchaseOrderNumber ? (
                  <>Purchase order {invoice.purchaseOrderNumber}</>
                ) : (
                  "No purchase order matched this number."
                )}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {files.length === 0 ? <li className="text-[#8a8496]">No file matched.</li> : null}
                {files.map((file) => <li key={file.filename}>{file.filename}</li>)}
              </ul>
            </section>
          );
        })}
        <section className="rounded-[22px] bg-white p-4">
          <h2 className="font-extrabold text-[#2f6fe0]">Files</h2>
          <p className="mt-1 text-xs text-[#8a8496]">Change a match, or assign a file that did not match on its own.</p>
          <ul className="mt-3 space-y-3">
            {draft.files.map((file, index) => (
              <li key={file.filename}>
                <label className="block text-sm font-extrabold">
                  {file.filename}
                  <select name={`assign:${index}`} defaultValue={file.invoiceKey || ""} className={selectClass}>
                    <option value="">Leave unmatched</option>
                    {draft.invoices.map((invoice) => (
                      <option key={invoice.key} value={invoice.key}>
                        {invoice.vendor} · {invoice.invoiceNumber}
                      </option>
                    ))}
                  </select>
                </label>
                {!file.invoiceKey && file.candidates.length > 1 ? (
                  <p className="mt-1 text-xs text-[#8a8496]">
                    More than one invoice number sits in this name: {file.candidates.map((key) => byKey.get(key)?.invoiceNumber).filter(Boolean).join(", ")}.
                  </p>
                ) : null}
              </li>
            ))}
            {draft.files.length === 0 ? <li className="text-sm text-[#8a8496]">The zip had no files.</li> : null}
          </ul>
        </section>
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Import</Button>
          <Link href="/invoices/import" className="inline-flex h-11 items-center rounded-2xl px-4 text-sm font-extrabold text-[#8a8496]">
            Start over
          </Link>
        </div>
      </form>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-3 text-center">
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-[11px] font-bold text-[#8a8496]">{label}</p>
    </div>
  );
}
