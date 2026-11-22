import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink, PageIntro } from "@/components/bits";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { customValues, dayStamp } from "@/server/ledger";

export default async function ExpenseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: { lines: { include: { account: true, asset: true } }, files: true, paymentAccount: true, supplier: true },
  });
  if (!expense) notFound();
  const fields = await customValues("expense", expense.id);
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/accounting/expenses">Expenses</BackLink>
      <PageIntro title={expense.vendorName} subtitle={dayStamp(expense.expenseDate)} />
      <section className="space-y-2 rounded-[22px] bg-white p-4">
        <p className="text-2xl font-extrabold">{formatMoney(expense.totalCents)}</p>
        <p className="text-sm">Paid from {expense.paymentAccount.code} {expense.paymentAccount.name}</p>
        {expense.supplier ? <p className="text-sm"><Link className="font-extrabold text-[#2f6fe0]" href={`/suppliers/${expense.supplier.id}`}>{expense.supplier.name}</Link></p> : null}
        {expense.whereName ? <p className="text-sm">Bought at {expense.whereName}</p> : null}
        {expense.whereUrl ? <p className="text-sm"><a className="font-extrabold text-[#2f6fe0]" href={expense.whereUrl}>{expense.whereUrl}</a></p> : null}
        {expense.whereAddress ? <p className="text-sm">{expense.whereAddress}</p> : null}
        {expense.memo ? <p className="text-sm text-[#8a8496]">{expense.memo}</p> : null}
        <ul className="space-y-1 text-sm">
          {expense.lines.map((line) => (
            <li key={line.id}>
              {line.account.code} {line.account.name} · {formatMoney(line.amountCents)}
              {line.memo ? ` · ${line.memo}` : ""}
              {line.isAsset ? " · equipment" : ""}
              {line.asset ? <Link className="ml-1 font-extrabold text-[#2f6fe0]" href={`/accounting/assets/${line.asset.id}`}>Open</Link> : null}
            </li>
          ))}
        </ul>
        {fields.filter((field) => field.value).map((field) => <p key={field.id} className="text-sm">{field.label}: {field.value}</p>)}
      </section>
      <h2 className="mb-2 mt-4 text-sm font-extrabold text-[#8a8496]">Receipts</h2>
      {expense.files.length === 0 ? <p className="text-sm text-[#8a8496]">No photo was attached.</p> : null}
      <ul className="space-y-2">
        {expense.files.map((file) => (
          <li key={file.id}><a className="font-extrabold text-[#2f6fe0]" href={`/api/accounting/files/${file.id}`}>{file.filename}</a></li>
        ))}
      </ul>
    </div>
  );
}
