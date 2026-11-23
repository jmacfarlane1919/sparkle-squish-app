import Link from "next/link";
import { Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/owner";
import { removeDuplicateCopies } from "@/server/actions/settings";
import { findDuplicateProducts } from "@/server/dedupe-products";

export const metadata = { title: "Find duplicate products" };

export default async function DuplicateProductsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const params = await searchParams;
  const session = await getSession();
  const owner = Boolean(session && (await isOwnerEmail(session.email)));
  const groups = owner ? await findDuplicateProducts() : [];
  const copies = groups.reduce((sum, group) => sum + group.remove.length, 0);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageIntro
        title="Find duplicate products"
        subtitle="These are app-only products with the same supplier, name, and supplier SKU or barcode. The copy with the most purchase orders, photos, receipts, stock, labels, and sales is kept. If those are equal, the older one is kept. Products already in Shopify are not listed."
      />
      <Notice notice={params.notice} error={params.error} />
      {!owner ? <p className="text-sm font-bold">Only the owner can remove duplicates.</p> : null}
      {owner && groups.length === 0 ? <p className="rounded-[22px] bg-white p-4 text-sm">No duplicate app-only products.</p> : null}
      {groups.map((group) => (
        <section key={group.keep.productId} className="rounded-[22px] bg-white p-4 text-sm">
          <h2 className="font-extrabold">{group.title}</h2>
          <p className="text-[#8a8496]">{group.supplierName}{group.vendorSku ? ` · supplier SKU ${group.vendorSku}` : ""}{group.vendorBarcode ? ` · barcode ${group.vendorBarcode}` : ""}</p>
          <p className="mt-2 font-bold text-[#14685a]">Keep {group.keep.ssSku} · {group.keep.references} links{group.remove.every((row) => row.references < group.keep.references) ? "" : " · kept because it is older"}</p>
          {group.remove.map((row) => (
            <p key={row.productId} className="text-[#8a5a12]">Remove {row.ssSku} · {row.references} links</p>
          ))}
        </section>
      ))}
      {owner && groups.length > 0 ? (
        <form action={removeDuplicateCopies} className="rounded-[22px] bg-white p-4">
          <p className="text-sm">{copies} copies will be removed. Their S&S SKUs and barcodes stay retired, and the barcode series is not moved.</p>
          <Button className="mt-3" type="submit">Remove duplicate copies</Button>
        </form>
      ) : null}
      <p><Link className="text-sm font-extrabold text-[#2f6fe0]" href="/settings">Back to settings</Link></p>
    </div>
  );
}
