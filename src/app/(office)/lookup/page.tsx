import Link from "next/link";
import { Monogram, Notice, PageIntro } from "@/components/bits";
import { ScanField } from "@/components/scan-field";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { formatMoney, onHand } from "@/lib/format";
import { matchField, matchLabel } from "@/lib/identifiers";

export const metadata = { title: "Barcode lookup" };

export default async function LookupPage({ searchParams }: { searchParams: Promise<{ code?: string; error?: string }> }) {
  const params = await searchParams;
  const code = (params.code || "").trim();
  const variants = code
    ? (await prisma.variant.findMany({ include: { product: { include: { photos: { take: 1 } } }, levels: { include: { location: true } } } })).filter((variant) => matchField(variant, code))
    : [];

  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Barcode lookup" subtitle="Scan an S&S barcode, a supplier barcode, an S&S SKU, or a supplier SKU." />
      <Notice error={params.error} />
      <form className="rounded-[22px] bg-white p-4" action="/lookup">
        <ScanField autoFocus />
        <Button className="mt-3 w-full" type="submit">Look up</Button>
      </form>
      <div className="mt-4 space-y-3">
        {code && variants.length === 0 ? <p className="text-sm text-[#8a8496]">Nothing matches {code}.</p> : null}
        {variants.length > 1 ? <p className="rounded-2xl bg-[#fde8ef] px-4 py-3 text-sm font-semibold text-[#8d2d52]">This code is on more than one product. See data quality.</p> : null}
        {variants.map((variant) => {
          const field = matchField(variant, code);
          const photo = variant.product.photos[0];
          return (
            <Link key={variant.id} href={`/products/${variant.productId}`} className="flex gap-3 rounded-[22px] bg-white p-4">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/photos/${photo.id}`} alt="" className="h-16 w-16 rounded-2xl object-cover" />
              ) : (
                <Monogram name={variant.product.title} className="h-16 w-16" />
              )}
              <span>
                <span className="block font-extrabold">{variant.product.title}</span>
                <span className="block text-xs font-bold text-[#1f8a78]">Matched the {field ? matchLabel(field) : "code"}</span>
                <span className="mt-1 block text-xs text-[#8a8496]">S&S {variant.ssSku} · {variant.ssBarcode}</span>
                <span className="block text-xs text-[#8a8496]">Supplier {variant.vendorSku || "—"} · {variant.vendorBarcode || "—"}</span>
                <span className="mt-1 block text-sm font-extrabold text-[#2f6fe0]">{formatMoney(variant.priceCents)} · {onHand(variant.levels)} on hand</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
