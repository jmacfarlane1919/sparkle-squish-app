import Link from "next/link";
import { LabelQueue } from "@/components/label-queue";
import { Notice, PageIntro } from "@/components/bits";
import { formatDay } from "@/lib/format";
import { labelsPrintedThrough, queueRows } from "@/server/label-queue";

export const metadata = { title: "Needs labels" };

export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const params = await searchParams;
  const [rows, cutoff] = await Promise.all([queueRows("needs_labels"), labelsPrintedThrough()]);
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    groups.set(row.receivedOn, [...(groups.get(row.receivedOn) || []), row]);
  }
  const grouped = [...groups.entries()].map(([date, items]) => ({
    date,
    label: formatDay(date),
    items: items.map((item) => ({ ...item, receivedLabel: formatDay(date) })),
  }));
  const stickers = rows.reduce((sum, row) => sum + row.printQty, 0);

  return (
    <div className="mx-auto max-w-xl">
      <PageIntro
        title="Needs labels"
        subtitle={rows.length ? `${rows.length} products · ${stickers} labels. Deliveries through ${cutoff} were already printed.` : `Deliveries through ${cutoff} were already printed.`}
        action={
          <Link href="/labels/history" className="text-sm font-extrabold text-[#2f6fe0]">
            Printed
          </Link>
        }
      />
      <Notice notice={params.notice} error={params.error} />
      {grouped.length === 0 ? (
        <p className="rounded-[22px] bg-white p-4 text-sm text-[#8a8496]">Nothing is waiting. A delivery, a new product, or an import received after {cutoff} shows up here.</p>
      ) : (
        <LabelQueue groups={grouped} />
      )}
    </div>
  );
}
