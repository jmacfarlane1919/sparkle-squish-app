import { BackLink, Notice, PageIntro } from "@/components/bits";
import { ScanField } from "@/components/scan-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/db";
import { commitCount, scanCount, setCountedQty } from "@/server/actions/counts";
import { notFound } from "next/navigation";

export default async function CountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const count = await prisma.inventoryCount.findUnique({
    where: { id },
    include: { location: true, lines: { include: { variant: { include: { product: true } } }, orderBy: { createdAt: "desc" } } },
  });
  if (!count) notFound();
  const open = count.status === "open";
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/counts">Counts</BackLink>
      <PageIntro title={count.location.name} subtitle={open ? "Scan each item. Scanning again adds one." : "This count is closed."} />
      <Notice notice={query.notice} error={query.error} />
      {open ? (
        <form action={scanCount} className="mb-4 rounded-[22px] bg-white p-4">
          <input type="hidden" name="countId" value={count.id} />
          <ScanField />
          <Button className="mt-3" type="submit">Add scan</Button>
        </form>
      ) : null}
      <div className="space-y-3">
        {count.lines.map((line) => (
          <section key={line.id} className="rounded-[22px] bg-white p-4">
            <p className="font-extrabold">{line.variant.product.title}</p>
            <p className="text-xs text-[#8a8496]">{line.variant.ssSku} · shelf was {line.systemQtyAtStart}</p>
            {open ? (
              <form action={setCountedQty} className="mt-3 flex items-end gap-2">
                <input type="hidden" name="lineId" value={line.id} />
                <input type="hidden" name="countId" value={count.id} />
                <Input name="qty" type="number" min={0} defaultValue={line.countedQty} className="w-24" />
                <Button type="submit" variant="secondary">Set</Button>
              </form>
            ) : (
              <p className="mt-2 text-sm">Counted {line.countedQty}. {line.commitDetail}</p>
            )}
          </section>
        ))}
      </div>
      {open ? (
        <form action={commitCount} className="mt-4">
          <input type="hidden" name="countId" value={count.id} />
          <Button type="submit">Commit count</Button>
        </form>
      ) : null}
    </div>
  );
}
