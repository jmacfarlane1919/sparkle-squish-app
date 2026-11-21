import { PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";

export const metadata = { title: "Barcode labels" };

export default async function LabelsPage() {
  const variants = await prisma.variant.findMany({
    where: { ssBarcode: { not: "" }, product: { status: "active" } },
    include: { product: true },
    orderBy: { product: { title: "asc" } },
  });
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Barcode labels" subtitle="Print S&S product labels. Each label uses the S&S barcode, not the supplier UPC." />
      <form action="/api/labels" className="rounded-[22px] bg-white p-4">
        <ul className="max-h-[28rem] space-y-2 overflow-auto">
          {variants.map((variant) => (
            <li key={variant.id}>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="id" value={variant.id} className="mt-1 h-4 w-4" />
                <span>
                  <span className="block font-extrabold">{variant.product.title}{variant.title !== "Default" ? ` · ${variant.title}` : ""}</span>
                  <span className="text-xs text-[#8a8496]">{variant.ssSku} · {variant.ssBarcode}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Button className="mt-4" type="submit">Download PDF</Button>
      </form>
    </div>
  );
}
