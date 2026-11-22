import { notFound } from "next/navigation";
import { BackLink, Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { accountBalance, reconciliationDifference } from "@/lib/accounting/reconcile";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { importStatement, saveReconciliation, statementToExpense } from "@/server/actions/accounting";
import { dayStamp } from "@/server/ledger";

export default async function ReconcileDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const rec = await prisma.reconciliation.findUnique({
    where: { id },
    include: { account: true, marks: true, statementLines: { orderBy: { lineDate: "asc" } } },
  });
  if (!rec) notFound();
  const finishedIds = await prisma.reconciliationMark.findMany({
    where: { reconciliation: { accountId: rec.accountId, finishedAt: { not: null }, id: { not: rec.id } } },
    select: { journalLineId: true },
  });
  const taken = new Set(finishedIds.map((row) => row.journalLineId));
  const lines = await prisma.journalLine.findMany({
    where: { accountId: rec.accountId, entry: { entryDate: { lte: rec.statementDate } } },
    include: { entry: true },
    orderBy: { entry: { entryDate: "asc" } },
  });
  const open = lines.filter((line) => !taken.has(line.id));
  const marked = new Set(rec.marks.map((mark) => mark.journalLineId));
  const cleared = accountBalance(rec.account.type === "liability" ? "liability" : "asset", open.filter((line) => marked.has(line.id)));
  const difference = reconciliationDifference(rec.endingBalanceCents, cleared);
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/accounting/reconcile">Reconcile</BackLink>
      <PageIntro title={rec.account.name} subtitle={`${dayStamp(rec.statementDate)} · statement ${formatMoney(rec.endingBalanceCents)}`} />
      <Notice notice={query.notice} error={query.error} />
      <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-sm">Cleared in the books: <strong>{formatMoney(cleared)}</strong>. Difference: <strong>{formatMoney(difference)}</strong>. Finish only at $0.00.</p>
      <form action={saveReconciliation} className="space-y-2">
        <input type="hidden" name="id" value={rec.id} />
        {open.map((line) => (
          <label key={line.id} className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-sm">
            <input type="checkbox" name="cleared" value={line.id} defaultChecked={marked.has(line.id)} disabled={Boolean(rec.finishedAt)} />
            <span>
              <span className="block font-extrabold">{line.entry.memo}</span>
              <span className="text-xs text-[#8a8496]">{dayStamp(line.entry.entryDate)} · {line.debitCents ? formatMoney(line.debitCents) : `−${formatMoney(line.creditCents)}`}</span>
            </span>
          </label>
        ))}
        {rec.finishedAt ? <p className="text-sm text-[#14685a]">This one is finished.</p> : (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="submit" variant="secondary">Save ticks</Button>
            <Button type="submit" name="finish" value="yes">Finish</Button>
          </div>
        )}
      </form>
      <form action={importStatement} className="mt-4 space-y-2 rounded-[22px] bg-white p-4">
        <input type="hidden" name="id" value={rec.id} />
        <h2 className="font-extrabold">Statement file</h2>
        <p className="text-xs text-[#8a8496]">CSV with Date, Description, and Amount. Negative amounts are money that left the account.</p>
        <input name="csv" type="file" accept=".csv,text/csv" className="block w-full text-sm" />
        <Button type="submit" variant="outline">Add statement lines</Button>
      </form>
      <ul className="mt-3 space-y-2">
        {rec.statementLines.map((line) => (
          <li key={line.id} className="rounded-2xl bg-white px-4 py-3 text-sm">
            <p className="font-extrabold">{line.description}</p>
            <p className="text-xs text-[#8a8496]">{dayStamp(line.lineDate)} · {formatMoney(line.amountCents)}{line.journalLineId ? " · matched" : ""}</p>
            {!line.journalLineId && line.amountCents < 0 ? (
              <form action={statementToExpense}>
                <input type="hidden" name="lineId" value={line.id} />
                <button className="mt-1 text-xs font-extrabold text-[#2f6fe0]" type="submit">Make this an expense</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
