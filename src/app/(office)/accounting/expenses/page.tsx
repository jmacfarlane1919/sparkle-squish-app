import Link from "next/link";
import { PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { dayStamp } from "@/server/ledger";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const [expenses, fields] = await Promise.all([
    prisma.expense.findMany({ orderBy: { expenseDate: "desc" }, include: { lines: true, paymentAccount: true }, take: 200 }),
    prisma.customField.findMany({ where: { entity: "expense", hidden: false }, include: { values: true } }),
  ]);
  const fieldId = params.field || "";
  const fieldValue = (params.value || "").toLowerCase();
  const shown = expenses.filter((expense) => {
    if (!fieldId || !fieldValue) return true;
    const match = fields.find((field) => field.id === fieldId)?.values.find((value) => value.recordId === expense.id);
    return (match?.value || "").toLowerCase().includes(fieldValue);
  });
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Expenses" subtitle="Money you already entered." action={<Link href="/accounting/expenses/new"><Button>New</Button></Link>} />
      <form className="mb-3 grid grid-cols-2 gap-2">
        <select name="field" defaultValue={fieldId} className="h-11 rounded-2xl border border-[#e4dced] px-2 text-sm">
          <option value="">Any extra field</option>
          {fields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
        </select>
        <input name="value" defaultValue={params.value || ""} placeholder="Contains" className="h-11 rounded-2xl border border-[#e4dced] px-3" />
        <Button type="submit" variant="secondary" className="col-span-2">Filter</Button>
      </form>
      <p className="mb-3 text-sm"><a className="font-extrabold text-[#2f6fe0]" href="/api/accounting/export?kind=expenses">Download CSV</a></p>
      <ul className="space-y-2">
        {shown.map((expense) => (
          <li key={expense.id}>
            <Link href={`/accounting/expenses/${expense.id}`} className="block rounded-[22px] bg-white px-4 py-3">
              <p className="font-extrabold">{expense.vendorName}</p>
              <p className="text-sm">{formatMoney(expense.totalCents)} · {dayStamp(expense.expenseDate)}</p>
              <p className="text-xs text-[#8a8496]">Paid from {expense.paymentAccount.name}{expense.lines.some((line) => line.isAsset) ? " · includes equipment" : ""}</p>
            </Link>
          </li>
        ))}
        {shown.length === 0 ? <li className="text-sm text-[#8a8496]">No expenses yet.</li> : null}
      </ul>
    </div>
  );
}
