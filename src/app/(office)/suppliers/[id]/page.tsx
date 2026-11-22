import Link from "next/link";
import { BackLink, Field, Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { updateSupplier } from "@/server/actions/purchasing";
import { notFound } from "next/navigation";

export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      products: { include: { variants: true }, orderBy: { title: "asc" } },
      purchaseOrders: { include: { lines: true }, orderBy: { createdAt: "desc" } },
      invoices: { orderBy: { invoiceDate: "desc" } },
    },
  });
  if (!supplier) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/suppliers">Suppliers</BackLink>
      <PageIntro title={supplier.name} subtitle="Contacts, invoices, and what you buy from them." />
      <Notice notice={query.notice} error={query.error} />
      <form action={updateSupplier} className="space-y-3 rounded-[22px] bg-white p-4">
        <input type="hidden" name="id" value={supplier.id} />
        <Field label="Name"><Input name="name" defaultValue={supplier.name} required /></Field>
        <Field label="Contact"><Input name="contactName" defaultValue={supplier.contactName} /></Field>
        <Field label="Email"><Input name="email" defaultValue={supplier.email} /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={supplier.phone} /></Field>
        <Field label="Notes"><Textarea name="notes" defaultValue={supplier.notes} /></Field>
        <Button type="submit">Save</Button>
      </form>
      <h2 className="mb-2 mt-6 text-sm font-extrabold text-[#8a8496]">Purchase orders</h2>
      <div className="space-y-2">
        {supplier.purchaseOrders.map((order) => (
          <Link key={order.id} href={`/receive/${order.id}`} className="block rounded-2xl bg-white px-4 py-3">
            <p className="font-extrabold">{order.number} · {order.status}</p>
            <p className="text-xs text-[#8a8496]">{order.invoiceNumber ? `Invoice ${order.invoiceNumber}` : "No invoice yet"} · {order.lines.length} lines</p>
          </Link>
        ))}
      </div>
      <h2 className="mb-2 mt-6 text-sm font-extrabold text-[#8a8496]">Invoices</h2>
      <div className="space-y-2">
        {supplier.invoices.length === 0 ? <p className="text-sm text-[#8a8496]">No invoices for this supplier yet.</p> : null}
        {supplier.invoices.map((invoice) => (
          <Link key={invoice.id} href={`/invoices/${invoice.id}`} className="block rounded-2xl bg-white px-4 py-3">
            <p className="font-extrabold">{invoice.invoiceNumber}</p>
            <p className="text-xs text-[#8a8496]">{invoice.status} · {formatMoney(invoice.totalCents)}</p>
          </Link>
        ))}
      </div>
      <h2 className="mb-2 mt-6 text-sm font-extrabold text-[#8a8496]">Products</h2>
      <div className="space-y-2">
        {supplier.products.map((product) => (
          <Link key={product.id} href={`/products/${product.id}`} className="block rounded-2xl bg-white px-4 py-3">
            <p className="font-extrabold">{product.title}</p>
            <p className="text-xs text-[#8a8496]">{product.variants[0]?.ssSku} · {formatMoney(product.variants[0]?.priceCents)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
