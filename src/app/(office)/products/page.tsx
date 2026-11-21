import Link from "next/link";
import { Monogram, Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/db";
import { formatMoney, onHand } from "@/lib/format";
import { runImport } from "@/server/actions/settings";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; notice?: string; error?: string }> }) {
  const params = await searchParams;
  const q = (params.q || "").trim().toLowerCase();
  const all = await prisma.product.findMany({
    include: { variants: { include: { levels: true } }, photos: { where: { role: "original" }, take: 1 } },
    orderBy: { title: "asc" },
  });
  const products = q
    ? all.filter((product) => {
        const haystack = [product.title, ...product.variants.flatMap((variant) => [variant.ssSku, variant.vendorSku, variant.ssBarcode, variant.vendorBarcode])].join(" ").toLowerCase();
        return haystack.includes(q);
      })
    : all;

  return (
    <div>
      <PageIntro
        title="Products"
        subtitle="Product list, photos, and pricing. New products get an S&S SKU and barcode."
        action={
          <Link href="/products/new">
            <Button>New</Button>
          </Link>
        }
      />
      <Notice notice={params.notice} error={params.error} />
      <form className="mb-4 flex gap-2" action="/products">
        <Input name="q" defaultValue={q} placeholder="Search name, SKU, or barcode" />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2">
        {products.map((product) => {
          const variant = product.variants[0];
          const stock = product.variants.reduce((sum, row) => sum + onHand(row.levels), 0);
          const photo = product.photos[0];
          return (
            <Link key={product.id} href={`/products/${product.id}`} className="flex gap-3 rounded-[22px] bg-white p-3 shadow-[0_8px_24px_rgba(80,60,110,0.06)]">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/photos/${photo.id}`} alt="" className="h-16 w-16 rounded-2xl object-cover" />
              ) : (
                <Monogram name={product.title} className="h-16 w-16 text-xl" />
              )}
              <span className="min-w-0">
                <span className="block truncate font-extrabold">{product.title}</span>
                <span className="block text-xs text-[#8a8496]">{variant?.ssSku || "No S&S SKU"} · {product.variants.length} variant{product.variants.length === 1 ? "" : "s"}</span>
                <span className="mt-1 block text-sm font-extrabold text-[#2f6fe0]">{formatMoney(variant?.priceCents)} · {stock} on hand</span>
              </span>
            </Link>
          );
        })}
      </div>
      {products.length === 0 ? <p className="mt-6 text-sm text-[#8a8496]">No products match that search.</p> : null}
      <form action={runImport} className="mt-6">
        <Button type="submit" variant="outline">Import from Shopify</Button>
      </form>
    </div>
  );
}
