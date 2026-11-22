import Link from "next/link";
import { PageIntro } from "@/components/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { isOwnerEmail } from "@/server/invoice-import";

export const metadata = { title: "Invoices" };

function day(date: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; q?: string }> }) {
  const params = await searchParams;
  const session = await getSession();
  const owner = Boolean(session && isOwnerEmail(session.email));
  const q = (params.q || "").trim().toLowerCase();
  const invoices = await prisma.invoice.findMany({
    include: { purchaseOrder: true, attachments: true },
    orderBy: { invoiceDate: "desc" },
  });
  const shown = q
    ? invoices.filter((invoice) => `${invoice.vendorName} ${invoice.invoiceNumber} ${invoice.category}`.toLowerCase().includes(q))
    : invoices;

  return (
    <div className="mx-auto max-w-xl">
      <PageIntro
        title="Invoices"
        subtitle={invoices.length ? `${invoices.length} saved invoices.` : "Supplier invoices, with the original file when you have it."}
        action={owner ? <Link href="/invoices/import"><Button>Import</Button></Link> : null}
      />
      {params.error ? <p className="mb-4 rounded-2xl bg-[#fde8ef] px-4 py-3 text-sm font-semibold text-[#8d2d52]">{params.error}</p> : null}
      {params.notice ? <p className="mb-4 rounded-2xl bg-[#e5f6f2] px-4 py-3 text-sm font-semibold text-[#14685a]">{params.notice}</p> : null}
      <form className="mb-4">
        <input
          name="q"
          defaultValue={params.q || ""}
          placeholder="Vendor, number, or category"
          className="h-11 w-full rounded-2xl border border-[#e4dced] bg-white px-3 text-base"
        />
      </form>
      {shown.length === 0 ? (
        <p className="rounded-[22px] bg-white p-4 text-sm text-[#8a8496]">
          {invoices.length ? "Nothing matches that search." : "No invoices yet. Import the CSV and the zip of files from the old app."}
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((invoice) => (
            <Link key={invoice.id} href={`/invoices/${invoice.id}`} className="block rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(80,60,110,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold text-[#2f6fe0]">{invoice.vendorName}</p>
                  <p className="text-sm">{invoice.invoiceNumber}</p>
                </div>
                <Badge className={invoice.status === "paid" ? "bg-[#d4f1ea] text-[#14685a]" : "bg-[#fde4c4] text-[#8a5a12]"}>{invoice.status}</Badge>
              </div>
              <p className="mt-2 text-sm font-extrabold">{formatMoney(invoice.totalCents)}</p>
              <p className="mt-1 text-xs text-[#8a8496]">
                {day(invoice.invoiceDate)}
                {invoice.category ? ` · ${invoice.category}` : ""}
                {invoice.purchaseOrder ? ` · ${invoice.purchaseOrder.number}` : ""}
                {invoice.attachments.length ? ` · ${invoice.attachments.length} file${invoice.attachments.length === 1 ? "" : "s"}` : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
