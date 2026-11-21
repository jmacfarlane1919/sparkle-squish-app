import Link from "next/link";
import { BackLink, Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { formatWhen } from "@/lib/format";
import { labelSize } from "@/lib/labels/sizes";
import type { PrintedLabel } from "@/lib/labels/render";
import { undoPrintJob } from "@/server/actions/labels";

export const metadata = { title: "Printed labels" };

export default async function PrintedLabelsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const params = await searchParams;
  const jobs = await prisma.labelPrintJob.findMany({ orderBy: { printedAt: "desc" }, take: 40 });
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/labels">Needs labels</BackLink>
      <PageIntro title="Printed labels" subtitle="Reprint a batch, or undo it and the products go back in the queue." />
      <Notice notice={params.notice} error={params.error} />
      <div className="space-y-3">
        {jobs.length === 0 ? <p className="rounded-[22px] bg-white p-4 text-sm text-[#8a8496]">Nothing has been printed from this app yet.</p> : null}
        {jobs.map((job) => {
          const snapshot = JSON.parse(job.snapshot) as PrintedLabel[];
          return (
            <article key={job.id} className="rounded-[22px] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold">{formatWhen(job.printedAt)}</p>
                  <p className="text-xs text-[#8a8496]">{labelSize(job.size).label} · {job.labelCount} labels{job.undoneAt ? " · undone" : ""}</p>
                </div>
                <Link href={`/api/labels/job/${job.id}`} className="text-sm font-extrabold text-[#2f6fe0]">Reprint</Link>
              </div>
              <ul className="mt-2 text-sm">
                {snapshot.map((row) => (
                  <li key={row.queueItemId}>{row.qty} × {row.name}</li>
                ))}
              </ul>
              {job.undoneAt ? null : (
                <form action={undoPrintJob} className="mt-3">
                  <input type="hidden" name="id" value={job.id} />
                  <Button type="submit" variant="outline">Undo</Button>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
