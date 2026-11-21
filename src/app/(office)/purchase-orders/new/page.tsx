import { BackLink, Field, Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/db";
import { createPurchaseOrder } from "@/server/actions/purchasing";

const selectClass = "h-11 w-full rounded-2xl border border-[#e4dced] bg-white px-3 text-base";

export const metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const [suppliers, locations, variants] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany(),
    prisma.variant.findMany({ include: { product: true }, orderBy: { product: { title: "asc" } } }),
  ]);
  const defaultLocation = locations.find((location) => location.isDefaultReceive)?.id || locations[0]?.id;
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/receive">Receive</BackLink>
      <PageIntro title="New purchase order" subtitle="Start as a draft. Purchase orders live here. Shopify’s purchase order API is read-only." />
      <Notice error={params.error} />
      <form action={createPurchaseOrder} className="space-y-3 rounded-[22px] bg-white p-4">
        <Field label="Supplier">
          <select name="supplierId" className={selectClass} required>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </Field>
        <Field label="Deliver to">
          <select name="locationId" className={selectClass} defaultValue={defaultLocation}>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </Field>
        <Field label="Invoice number"><Input name="invoiceNumber" placeholder="ML-459" /></Field>
        <Field label="First item">
          <select name="variantId" className={selectClass} required>
            {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.product.title} · {variant.ssSku}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Qty"><Input name="qty" type="number" min={1} defaultValue={1} required /></Field>
          <Field label="Unit cost"><Input name="cost" inputMode="decimal" required placeholder="5.25" /></Field>
        </div>
        <Field label="Notes"><Textarea name="notes" /></Field>
        <Button type="submit">Save draft</Button>
      </form>
    </div>
  );
}
