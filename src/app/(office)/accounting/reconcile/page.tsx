import Link from "next/link";
import { Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { startReconciliation } from "@/server/actions/accounting";
import { accountMap, dayStamp } from "@/server/ledger";

export const metadata = { title: "Reconcile" };

export default async function ReconcilePage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const params = await searchParams;
  const [{ rows }, history] = await Promise.all([
    accountMap(),
    prisma.reconciliation.findMany({ orderBy: { statementDate: "desc" }, include: { account: true }, take: 20 }),
  ]);
  const unique = rows.filter((account) => account.active && (account.type === "asset" || account.type === "liability"));
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Reconcile" subtitle="Pick the bank, card, or clearing account. Finish when your statement and the books match." />
      <Notice notice={params.notice} error={params.error} />
      <form action={startReconciliation} className="space-y-3 rounded-[22px] bg-white p-4">
        <label className="block text-sm font-extrabold">Account
          <select name="accountId" className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3">
            {unique.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-extrabold">Statement end date<input name="date" type="date" required className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <label className="block text-sm font-extrabold">Ending balance on the statement<input name="ending" inputMode="decimal" required placeholder="0.00" className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <Button type="submit">Start</Button>
      </form>
      <h2 className="mb-2 mt-6 text-sm font-extrabold text-[#8a8496]">History</h2>
      <ul className="space-y-2">
        {history.map((row) => (
          <li key={row.id}>
            <Link href={`/accounting/reconcile/${row.id}`} className="block rounded-2xl bg-white px-4 py-3 text-sm">
              <p className="font-extrabold">{row.account.name}</p>
              <p className="text-xs text-[#8a8496]">{dayStamp(row.statementDate)} · {formatMoney(row.endingBalanceCents)} · {row.finishedAt ? "Finished" : "In progress"}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
