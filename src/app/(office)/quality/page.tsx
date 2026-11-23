import Link from "next/link";
import { PageIntro } from "@/components/bits";
import { prisma } from "@/lib/db";

export const metadata = { title: "Data quality" };

export default async function QualityPage() {
  const variants = await prisma.variant.findMany({ include: { product: true }, orderBy: { ssSku: "asc" } });
  const bySku = new Map<string, typeof variants>();
  const byBarcode = new Map<string, typeof variants>();
  for (const variant of variants) {
    if (variant.ssSku) bySku.set(variant.ssSku, [...(bySku.get(variant.ssSku) || []), variant]);
    if (variant.ssBarcode) byBarcode.set(variant.ssBarcode, [...(byBarcode.get(variant.ssBarcode) || []), variant]);
  }
  const duplicateSkus = [...bySku.entries()].filter(([, rows]) => rows.length > 1);
  const duplicateBarcodes = [...byBarcode.entries()].filter(([, rows]) => rows.length > 1);
  const missingCosts = variants.filter((variant) => variant.costCents == null);
  const missingCodes = variants.filter((variant) => !variant.ssSku || !variant.ssBarcode);
  const incoming = await prisma.purchaseOrderLine.findMany({
    where: { variantId: null },
    include: { purchaseOrder: true },
    orderBy: { description: "asc" },
  });

  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Data quality" subtitle="Duplicate S&S SKUs, duplicate S&S barcodes, products missing a cost, and purchase-order lines that are not linked to a product yet." />
      <section className="mt-4 rounded-[22px] bg-white p-4">
        <h2 className="font-extrabold text-[#2f6fe0]">Incoming items ({incoming.length})</h2>
        {incoming.length === 0 ? <p className="mt-2 text-sm text-[#8a8496]">Every purchase-order line is linked to a product.</p> : null}
        <ul className="mt-2 space-y-2">
          {incoming.map((line) => (
            <li key={line.id}>
              <Link className="text-sm font-bold" href={`/receive/${line.purchaseOrderId}`}>{line.purchaseOrder.number} · {line.description}{line.supplierSku ? ` · ${line.supplierSku}` : ""}</Link>
            </li>
          ))}
        </ul>
      </section>
      <Group title="Duplicate S&S SKUs" empty="No duplicate S&S SKUs." rows={duplicateSkus} />
      <Group title="Duplicate S&S barcodes" empty="No duplicate S&S barcodes." rows={duplicateBarcodes} />
      <section className="mt-4 rounded-[22px] bg-white p-4">
        <h2 className="font-extrabold text-[#2f6fe0]">Missing costs</h2>
        {missingCosts.length === 0 ? <p className="mt-2 text-sm text-[#8a8496]">Every variant has a cost.</p> : null}
        <ul className="mt-2 space-y-2">
          {missingCosts.map((variant) => (
            <li key={variant.id}><Link className="text-sm font-bold" href={`/products/${variant.productId}`}>{variant.product.title} · {variant.ssSku}</Link></li>
          ))}
        </ul>
      </section>
      {missingCodes.length ? (
        <section className="mt-4 rounded-[22px] bg-white p-4">
          <h2 className="font-extrabold text-[#2f6fe0]">Missing S&S identifiers</h2>
          <ul className="mt-2 space-y-2">
            {missingCodes.map((variant) => (
              <li key={variant.id}><Link className="text-sm font-bold" href={`/products/${variant.productId}`}>{variant.product.title}</Link></li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Group({ title, empty, rows }: { title: string; empty: string; rows: [string, { id: string; productId: string; product: { title: string } }[]][] }) {
  return (
    <section className="mt-4 rounded-[22px] bg-white p-4">
      <h2 className="font-extrabold text-[#2f6fe0]">{title}</h2>
      {rows.length === 0 ? <p className="mt-2 text-sm text-[#8a8496]">{empty}</p> : null}
      {rows.map(([code, variants]) => (
        <div key={code} className="mt-3">
          <p className="text-sm font-extrabold">{code}</p>
          <ul>
            {variants.map((variant) => (
              <li key={variant.id}><Link className="text-sm text-[#2f6fe0]" href={`/products/${variant.productId}`}>{variant.product.title}</Link></li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
