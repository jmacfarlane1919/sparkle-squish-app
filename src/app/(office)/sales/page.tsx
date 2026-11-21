import Link from "next/link";
import { PageIntro } from "@/components/bits";
import { prisma } from "@/lib/db";
import { channelLabel, chicagoDateKey, formatDay, formatMoney, formatPercent, formatWhen, shiftDateKey } from "@/lib/format";

export const metadata = { title: "Sales and COGS" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const today = chicagoDateKey(new Date());
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const [orders, refunds] = await Promise.all([
    prisma.saleOrder.findMany({ include: { lines: true }, orderBy: { processedAt: "desc" }, take: 400 }),
    prisma.refund.findMany({ include: { lines: true, order: true }, take: 200 }),
  ]);
  const dayOrders = orders.filter((order) => !order.cancelled && chicagoDateKey(order.processedAt) === date);
  const dayRefunds = refunds.filter((refund) => chicagoDateKey(refund.processedAt) === date);
  const total = summarize(dayOrders, dayRefunds);
  const online = summarize(dayOrders.filter((order) => order.channel === "online"), dayRefunds.filter((refund) => refund.order.channel === "online"));
  const pos = summarize(dayOrders.filter((order) => order.channel === "pos"), dayRefunds.filter((refund) => refund.order.channel === "pos"));

  return (
    <div className="mx-auto max-w-3xl">
      <PageIntro title="Sales and COGS" subtitle="Imported from Shopify. Online and The Squishy Shop are split apart." />
      <div className="mb-4 flex items-center justify-between text-sm font-extrabold text-[#2f6fe0]">
        <Link href={`/sales?date=${shiftDateKey(date, -1)}`}>Previous day</Link>
        <span className="text-[#2c2640]">{formatDay(date)}</span>
        <Link href={`/sales?date=${shiftDateKey(date, 1)}`}>Next day</Link>
      </div>
      <section className="rounded-[22px] bg-white p-4">
        <div className="grid grid-cols-3 gap-2">
          <Figure label="Sales" value={formatMoney(total.sales)} />
          <Figure label="COGS" value={formatMoney(total.cogs)} />
          <Figure label="Gross margin" value={formatPercent(total.margin)} />
        </div>
        {total.missing ? <p className="mt-3 text-xs font-semibold text-[#8d4d68]">A line is missing its cost, so COGS is incomplete.</p> : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl bg-[#d9e7fb] p-3"><p className="font-extrabold">Online</p><p className="text-sm">{formatMoney(online.sales)} · {formatPercent(online.margin)} margin</p></div>
          <div className="rounded-2xl bg-[#f8d5e4] p-3"><p className="font-extrabold">The Squishy Shop</p><p className="text-sm">{formatMoney(pos.sales)} · {formatPercent(pos.margin)} margin</p></div>
        </div>
      </section>
      <h2 className="mb-2 mt-6 text-sm font-extrabold text-[#8a8496]">Orders</h2>
      <div className="space-y-2">
        {dayOrders.map((order) => {
          const amount = order.lines.reduce((sum, line) => sum + line.qty * line.unitPriceCents, 0);
          const cogs = order.lines.reduce((sum, line) => sum + line.qty * (line.unitCostCents ?? 0), 0);
          return (
            <article key={order.id} className="rounded-2xl bg-white px-4 py-3">
              <div className="flex justify-between gap-3">
                <p className="font-extrabold">{order.name}</p>
                <p className="font-extrabold">{formatMoney(amount)}</p>
              </div>
              <p className="text-xs text-[#8a8496]">{formatWhen(order.processedAt)} · {channelLabel(order.channel)} · COGS {formatMoney(cogs)}</p>
              <ul className="mt-1 text-sm">
                {order.lines.map((line) => <li key={line.id}>{line.qty} × {line.title}</li>)}
              </ul>
            </article>
          );
        })}
        {dayOrders.length === 0 ? <p className="text-sm text-[#8a8496]">No sales this day.</p> : null}
      </div>
      {dayRefunds.length ? (
        <>
          <h2 className="mb-2 mt-6 text-sm font-extrabold text-[#8a8496]">Refunds</h2>
          {dayRefunds.map((refund) => (
            <p key={refund.id} className="mb-2 rounded-2xl bg-white px-4 py-3 text-sm">
              {refund.order.name} · {channelLabel(refund.order.channel)} · {formatMoney(refund.lines.reduce((sum, line) => sum + line.amountCents, 0))} returned
            </p>
          ))}
        </>
      ) : null}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xl font-extrabold">{value}</p><p className="text-xs font-bold text-[#8a8496]">{label}</p></div>;
}

function summarize(
  orders: { lines: { qty: number; unitPriceCents: number; unitCostCents: number | null }[] }[],
  refunds: { lines: { qty: number; amountCents: number; unitCostCents: number | null }[] }[],
) {
  let sales = 0;
  let cogs = 0;
  let missing = false;
  for (const order of orders) {
    for (const line of order.lines) {
      sales += line.qty * line.unitPriceCents;
      if (line.unitCostCents == null) missing = true;
      else cogs += line.qty * line.unitCostCents;
    }
  }
  for (const refund of refunds) {
    for (const line of refund.lines) {
      sales -= line.amountCents;
      if (line.unitCostCents == null) missing = true;
      else cogs -= line.qty * line.unitCostCents;
    }
  }
  return { sales, cogs, margin: sales !== 0 ? (sales - cogs) / sales : null, missing };
}
