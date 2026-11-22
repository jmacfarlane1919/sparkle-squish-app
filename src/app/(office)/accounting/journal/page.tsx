import { Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { saveManual } from "@/server/actions/accounting";
import { accountMap, dayStamp } from "@/server/ledger";

export const metadata = { title: "Adjustments" };

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const params = await searchParams;
  const [{ rows }, entries] = await Promise.all([
    accountMap(),
    prisma.journalEntry.findMany({ orderBy: { entryDate: "desc" }, take: 30, include: { lines: true } }),
  ]);
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Adjustments" subtitle="Use this when something is not a normal expense or bill. Debits and credits have to match." />
      <Notice notice={params.notice} error={params.error} />
      <form action={saveManual} className="space-y-3 rounded-[22px] bg-white p-4">
        <label className="block text-sm font-extrabold">Date<input name="date" type="date" required className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <label className="block text-sm font-extrabold">What is this for?<input name="memo" required className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="grid grid-cols-3 gap-2">
            <select name={`account-${index}`} className="col-span-3 h-10 rounded-2xl border border-[#e4dced] px-2 text-sm">
              <option value="">Account</option>
              {rows.filter((account) => account.active).map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
            </select>
            <input name={`debit-${index}`} placeholder="Increase" className="h-10 rounded-2xl border border-[#e4dced] px-2 text-sm" />
            <input name={`credit-${index}`} placeholder="Decrease" className="h-10 rounded-2xl border border-[#e4dced] px-2 text-sm" />
            <p className="self-center text-[11px] text-[#8a8496]">Left adds. Right subtracts from a bank. For a bill you owe, right adds.</p>
          </div>
        ))}
        <Button type="submit">Save adjustment</Button>
      </form>
      <h2 className="mb-2 mt-6 text-sm font-extrabold text-[#8a8496]">Recent entries</h2>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-2xl bg-white px-4 py-3 text-sm">
            <p className="font-extrabold">{entry.memo}</p>
            <p className="text-xs text-[#8a8496]">{dayStamp(entry.entryDate)} · {entry.source} · {formatMoney(entry.lines.reduce((sum, line) => sum + line.debitCents, 0))}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
