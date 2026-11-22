import Link from "next/link";
import { PageIntro } from "@/components/bits";
import { balanceSheet, priorPeriod, profitAndLoss, trialBalance } from "@/lib/accounting/reports";
import { formatMoney } from "@/lib/format";
import { chicagoDateKey } from "@/lib/format";
import { ledgerMovements } from "@/server/ledger";

export const metadata = { title: "Reports" };

function money(cents: number) {
  return formatMoney(cents);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ kind?: string; from?: string; to?: string; account?: string; months?: string; compare?: string }> }) {
  const params = await searchParams;
  const today = chicagoDateKey(new Date());
  const from = params.from || `${today.slice(0, 4)}-01-01`;
  const to = params.to || today;
  const kind = params.kind || "pl";
  const { accounts, lines } = await ledgerMovements();
  const prior = priorPeriod(from, to);
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Reports" subtitle="Pick dates, then open the report. PDF and CSV use the same numbers." />
      <div className="mb-3 flex flex-wrap gap-2 text-sm font-extrabold">
        {[
          ["pl", "Profit"],
          ["bs", "Balance sheet"],
          ["tb", "Trial balance"],
          ["gl", "One account"],
        ].map(([id, label]) => (
          <Link key={id} href={`/accounting/reports?kind=${id}&from=${from}&to=${to}`} className={`rounded-full px-3 py-1 ${kind === id ? "bg-[#2f6fe0] text-white" : "bg-white text-[#2f6fe0]"}`}>{label}</Link>
        ))}
      </div>
      <form className="mb-4 grid grid-cols-2 gap-2 rounded-[22px] bg-white p-4">
        <input type="hidden" name="kind" value={kind} />
        {kind !== "bs" && kind !== "tb" ? <label className="text-sm font-extrabold">From<input name="from" type="date" defaultValue={from} className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-2" /></label> : null}
        <label className="text-sm font-extrabold">{kind === "bs" || kind === "tb" ? "As of" : "To"}<input name="to" type="date" defaultValue={to} className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-2" /></label>
        {kind === "pl" ? (
          <>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="months" value="yes" defaultChecked={params.months === "yes"} /> Show months</label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="compare" value="yes" defaultChecked={params.compare === "yes"} /> Compare to {prior.from} – {prior.to}</label>
          </>
        ) : null}
        {kind === "gl" ? (
          <select name="account" defaultValue={params.account || accounts[0]?.id} className="col-span-2 h-11 rounded-2xl border border-[#e4dced] px-2">
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        ) : null}
        <button className="col-span-2 h-11 rounded-2xl bg-[#2f6fe0] text-sm font-extrabold text-white" type="submit">Update</button>
      </form>
      <p className="mb-3 flex gap-3 text-sm font-extrabold">
        <a className="text-[#2f6fe0]" href={`/api/accounting/export?kind=${kind}&from=${from}&to=${to}&account=${params.account || ""}&months=${params.months || ""}&compare=${params.compare || ""}`}>CSV</a>
        <a className="text-[#2f6fe0]" href={`/api/accounting/export?format=pdf&kind=${kind}&from=${from}&to=${to}&account=${params.account || ""}&months=${params.months || ""}&compare=${params.compare || ""}`}>PDF</a>
      </p>
      {kind === "pl" ? <Profit accounts={accounts} lines={lines} from={from} to={to} months={params.months === "yes"} compare={params.compare === "yes"} /> : null}
      {kind === "bs" ? <Sheet accounts={accounts} lines={lines} asOf={to} /> : null}
      {kind === "tb" ? <Trial accounts={accounts} lines={lines} asOf={to} /> : null}
      {kind === "gl" ? <Detail accounts={accounts} lines={lines} from={from} to={to} accountId={params.account || accounts[0]?.id || ""} /> : null}
    </div>
  );
}

function Profit({ accounts, lines, from, to, months, compare }: { accounts: Awaited<ReturnType<typeof ledgerMovements>>["accounts"]; lines: Awaited<ReturnType<typeof ledgerMovements>>["lines"]; from: string; to: string; months: boolean; compare: boolean }) {
  const report = profitAndLoss({ accounts, lines, from, to, byMonth: months, compare });
  return (
    <section className="space-y-3 rounded-[22px] bg-white p-4">
      <h2 className="font-extrabold">Profit from {from} to {to}</h2>
      <Group title="Money in" rows={report.income} total={report.incomeCents} />
      <Group title="Cost of product sold" rows={report.cogs} total={report.cogsCents} />
      <p className="flex justify-between text-sm font-extrabold"><span>Left after product cost</span><span>{money(report.grossCents)}</span></p>
      <Group title="Other costs" rows={report.expenses} total={report.expenseCents} />
      <p className="flex justify-between border-t border-[#f0ebf6] pt-2 text-base font-extrabold"><span>Profit</span><span>{money(report.netCents)}</span></p>
      {compare && report.prior ? <p className="text-sm text-[#8a8496]">Prior period {report.prior.from} to {report.prior.to}: {money(report.priorNetCents || 0)}</p> : null}
      {months && report.months.length ? <p className="text-xs text-[#8a8496]">Months: {report.months.join(", ")}. Line amounts above are the whole range.</p> : null}
    </section>
  );
}

function Group({ title, rows, total }: { title: string; rows: { id: string; code: string; name: string; amountCents: number }[]; total: number }) {
  return (
    <div>
      <h3 className="text-sm font-extrabold text-[#8a8496]">{title}</h3>
      {rows.map((row) => <p key={row.id} className="flex justify-between text-sm"><span>{row.code} {row.name}</span><span>{money(row.amountCents)}</span></p>)}
      <p className="flex justify-between text-sm font-extrabold"><span>Total</span><span>{money(total)}</span></p>
    </div>
  );
}

function Sheet({ accounts, lines, asOf }: { accounts: Awaited<ReturnType<typeof ledgerMovements>>["accounts"]; lines: Awaited<ReturnType<typeof ledgerMovements>>["lines"]; asOf: string }) {
  const report = balanceSheet({ accounts, lines, asOf });
  return (
    <section className="space-y-3 rounded-[22px] bg-white p-4">
      <h2 className="font-extrabold">What you own and owe on {asOf}</h2>
      <Group title="What you own" rows={report.assets} total={report.assetCents} />
      <Group title="What you owe" rows={report.liabilities} total={report.liabilityCents} />
      <Group title="Owner's stake" rows={report.equity} total={report.equityCents} />
      <p className="flex justify-between text-sm"><span>Profit not closed into equity</span><span>{money(report.earningsCents)}</span></p>
      <p className="text-sm font-extrabold">{report.balanced ? "This balances. What you own equals what you owe plus your stake plus profit." : "This does not balance. Check the latest adjustments."}</p>
    </section>
  );
}

function Trial({ accounts, lines, asOf }: { accounts: Awaited<ReturnType<typeof ledgerMovements>>["accounts"]; lines: Awaited<ReturnType<typeof ledgerMovements>>["lines"]; asOf: string }) {
  const report = trialBalance({ accounts, lines, asOf });
  return (
    <section className="space-y-1 rounded-[22px] bg-white p-4 text-sm">
      <h2 className="font-extrabold">Trial balance on {asOf}</h2>
      {report.rows.map((row) => <p key={row.id} className="flex justify-between"><span>{row.code} {row.name}</span><span>{money(row.debitCents)} / {money(row.creditCents)}</span></p>)}
      <p className="font-extrabold">Debits {money(report.debitCents)} · Credits {money(report.creditCents)} · {report.balanced ? "Balanced" : "Out of balance"}</p>
    </section>
  );
}

function Detail({ accounts, lines, from, to, accountId }: { accounts: Awaited<ReturnType<typeof ledgerMovements>>["accounts"]; lines: Awaited<ReturnType<typeof ledgerMovements>>["lines"]; from: string; to: string; accountId: string }) {
  const account = accounts.find((row) => row.id === accountId);
  const rows = lines.filter((line) => line.accountId === accountId && line.entryDate >= from && line.entryDate <= to);
  return (
    <section className="space-y-1 rounded-[22px] bg-white p-4 text-sm">
      <h2 className="font-extrabold">{account ? `${account.code} ${account.name}` : "Account"}</h2>
      {rows.map((line, index) => <p key={index} className="flex justify-between"><span>{line.entryDate} {line.entryMemo}</span><span>{line.debitCents ? money(line.debitCents) : `−${money(line.creditCents)}`}</span></p>)}
      {rows.length === 0 ? <p className="text-[#8a8496]">Nothing in these dates.</p> : null}
    </section>
  );
}
