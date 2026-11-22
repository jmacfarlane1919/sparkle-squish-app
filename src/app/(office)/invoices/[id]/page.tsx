import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { BackLink, Notice, PageIntro } from "@/components/bits";
import { BooksLines } from "@/components/books-lines";
import { CustomFields } from "@/components/custom-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { payInvoice, saveInvoiceBooks } from "@/server/actions/accounting";
import { accountMap, customValues } from "@/server/ledger";

function day(date: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(date);
}

function moneyLine(label: string, cents: number | null) {
  if (cents == null) return null;
  return (
    <p className="flex justify-between text-sm">
      <span className="text-[#8a8496]">{label}</span>
      <span className="font-extrabold">{formatMoney(cents)}</span>
    </p>
  );
}

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { attachments: { orderBy: { filename: "asc" } }, purchaseOrder: true, supplier: true, lines: true },
  });
  if (!invoice) notFound();
  const [{ rows, byKey }, fields] = await Promise.all([accountMap(), customValues("invoice", invoice.id)]);
  const payFrom = rows.filter((account) => account.active && (account.type === "asset" || account.type === "liability"));

  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/invoices">Invoices</BackLink>
      <PageIntro title={invoice.vendorName} subtitle={invoice.invoiceNumber} />
      <Notice notice={query.notice} error={query.error} />
      <section className="space-y-2 rounded-[22px] bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-2xl font-extrabold">{formatMoney(invoice.totalCents)}</p>
          <Badge className={invoice.status === "paid" ? "bg-[#d4f1ea] text-[#14685a]" : "bg-[#fde4c4] text-[#8a5a12]"}>{invoice.status}</Badge>
        </div>
        <p className="text-sm text-[#8a8496]">{day(invoice.invoiceDate)}{invoice.category ? ` · ${invoice.category}` : ""}</p>
        {invoice.paidFrom ? <p className="text-sm">Paid from {invoice.paidFrom}</p> : null}
        {invoice.supplier ? <p className="text-sm"><Link className="font-extrabold text-[#2f6fe0]" href={`/suppliers/${invoice.supplier.id}`}>{invoice.supplier.name}</Link></p> : null}
        {invoice.purchaseOrder ? (
          <p className="text-sm">
            Purchase order <Link className="font-extrabold text-[#2f6fe0]" href={`/receive/${invoice.purchaseOrder.id}`}>{invoice.purchaseOrder.number}</Link>
          </p>
        ) : (
          <p className="text-sm text-[#8a8496]">Not linked to a purchase order.</p>
        )}
        {moneyLine("Subtotal", invoice.subtotalCents)}
        {moneyLine("Discount", invoice.discountCents)}
        {moneyLine("Shipping", invoice.shippingCents)}
        {moneyLine("Tax", invoice.taxCents)}
      </section>
      <ActionForm action={saveInvoiceBooks} className="mt-4 space-y-3 rounded-[22px] bg-white p-4">
        <h2 className="font-extrabold">Put this bill in the books</h2>
        <p className="text-sm text-[#8a8496]">Inventory is the first guess. Turn on the equipment box for something you keep. Leave “I already paid” off if you still owe it.</p>
        <input type="hidden" name="invoiceId" value={invoice.id} />
        <label className="block text-sm font-extrabold">Date<input name="date" type="date" required defaultValue={invoice.invoiceDate.toISOString().slice(0, 10)} className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <BooksLines
          accounts={rows.filter((account) => account.active).map((account) => ({ id: account.id, code: account.code, name: account.name, type: account.type, systemKey: account.systemKey }))}
          inventoryId={byKey.get("inventory")?.id || ""}
          equipmentId={byKey.get("fixed_assets")?.id || ""}
          defaultLines={invoice.lines.map((line) => ({ accountId: line.accountId, amount: (line.amountCents / 100).toFixed(2), memo: line.memo, isAsset: line.isAsset }))}
        />
        <label className="block text-sm font-extrabold">Where you bought it<input name="whereName" defaultValue={invoice.whereName} className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <label className="block text-sm font-extrabold">Website<input name="whereUrl" defaultValue={invoice.whereUrl} className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <label className="block text-sm font-extrabold">Address<input name="whereAddress" defaultValue={invoice.whereAddress} className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <label className="block text-sm font-extrabold">Paid from, if you already paid
          <select name="paymentAccountId" className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" defaultValue={invoice.paymentAccountId || byKey.get("member")?.id}>
            <option value="">Still owe this</option>
            {payFrom.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="paid" value="yes" defaultChecked={invoice.status === "paid"} /> I already paid this</label>
        <label className="block text-sm font-extrabold">Photos<input name="files" type="file" accept="image/*,.pdf" multiple className="mt-1 block w-full text-sm" /></label>
        <CustomFields fields={fields} />
        <Button type="submit">Save in the books</Button>
      </ActionForm>
      {!invoice.paymentEntryId && invoice.billEntryId ? (
        <form action={payInvoice} className="mt-3 space-y-2 rounded-[22px] bg-white p-4">
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <label className="block text-sm font-extrabold">Pay it now from
            <select name="paymentAccountId" className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3">
              {payFrom.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-extrabold">Date<input name="date" type="date" required className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
          <Button type="submit" variant="secondary">Mark paid</Button>
        </form>
      ) : null}
      <h2 className="mb-2 mt-6 text-sm font-extrabold text-[#8a8496]">Files</h2>
      {invoice.attachments.length === 0 ? <p className="text-sm text-[#8a8496]">No file is attached.</p> : null}
      <div className="space-y-2">
        {invoice.attachments.map((file) => (
          <a key={file.id} href={`/api/invoices/files/${file.id}`} target="_blank" rel="noreferrer" className="block rounded-2xl bg-white px-4 py-3 text-sm font-extrabold text-[#2f6fe0]">
            {file.filename}
          </a>
        ))}
      </div>
    </div>
  );
}
