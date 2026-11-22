import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink, PageIntro } from "@/components/bits";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";

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

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { attachments: { orderBy: { filename: "asc" } }, purchaseOrder: true, supplier: true },
  });
  if (!invoice) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/invoices">Invoices</BackLink>
      <PageIntro title={invoice.vendorName} subtitle={invoice.invoiceNumber} />
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
