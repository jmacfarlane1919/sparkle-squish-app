import Link from "next/link";
import { Field, Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { formatWhen } from "@/lib/format";
import { startCount } from "@/server/actions/counts";

const selectClass = "h-11 w-full rounded-2xl border border-[#e4dced] bg-white px-3 text-base";

export const metadata = { title: "Inventory count" };

export default async function CountsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const params = await searchParams;
  const [locations, counts] = await Promise.all([
    prisma.location.findMany(),
    prisma.inventoryCount.findMany({ include: { location: true, lines: true }, orderBy: { startedAt: "desc" }, take: 12 }),
  ]);
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Inventory count" subtitle="Scan what is on the shelf. A count only replaces Shopify stock when nothing sold during the count." />
      <Notice notice={params.notice} error={params.error} />
      <form action={startCount} className="space-y-3 rounded-[22px] bg-white p-4">
        <Field label="Location">
          <select name="locationId" className={selectClass} defaultValue={locations.find((location) => location.isDefaultReceive)?.id}>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </Field>
        <Button type="submit">Start a count</Button>
      </form>
      <div className="mt-4 space-y-2">
        {counts.length === 0 ? <p className="text-sm text-[#8a8496]">No counts yet.</p> : null}
        {counts.map((count) => (
          <Link key={count.id} href={`/counts/${count.id}`} className="block rounded-[22px] bg-white px-4 py-3">
            <p className="font-extrabold">{count.location.name}</p>
            <p className="text-xs text-[#8a8496]">{count.status} · {count.lines.length} items · {formatWhen(count.startedAt)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
