import Link from "next/link";
import { Card, PageIntro } from "@/components/bits";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { channelLabel, chicagoDateKey, formatDay, formatMoney, formatPercent, formatWhen, greeting } from "@/lib/format";
import { needsLabelCount } from "@/server/label-queue";

export default async function HomePage() {
  const today = chicagoDateKey(new Date());
  const [orders, refunds, variants, openOrders, labelCount, unlinked] = await Promise.all([
    prisma.saleOrder.findMany({ include: { lines: true }, orderBy: { processedAt: "desc" }, take: 300 }),
    prisma.refund.findMany({ include: { lines: true, order: true }, orderBy: { processedAt: "desc" }, take: 100 }),
    prisma.variant.findMany({ select: { ssSku: true, ssBarcode: true, costCents: true } }),
    prisma.purchaseOrder.count({ where: { status: { in: ["ordered", "partial"] } } }),
    needsLabelCount(),
    prisma.purchaseOrderLine.count({ where: { variantId: null } }),
  ]);
  const dayOrders = orders.filter((order) => !order.cancelled && chicagoDateKey(order.processedAt) === today);
  const dayRefunds = refunds.filter((refund) => chicagoDateKey(refund.processedAt) === today);
  const summary = summarize(dayOrders, dayRefunds);
  const online = summarize(dayOrders.filter((order) => order.channel === "online"), dayRefunds.filter((refund) => refund.order.channel === "online"));
  const pos = summarize(dayOrders.filter((order) => order.channel === "pos"), dayRefunds.filter((refund) => refund.order.channel === "pos"));
  const issues = qualityCount(variants);

  return (
    <div className="mx-auto max-w-3xl">
      <PageIntro title={greeting()} subtitle={`${formatDay(today)} · Chicago time. Shopify is still the storefront and the register.`} />
      <Card className="bg-gradient-to-br from-white to-[#f7f2fb]">
        <p className="text-xs font-extrabold uppercase tracking-wide text-[#8a8496]">Today</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Sales" value={formatMoney(summary.sales)} />
          <Metric label="COGS" value={formatMoney(summary.cogs)} />
          <Metric label="Margin" value={formatPercent(summary.margin)} />
        </div>
        {summary.missing ? <p className="mt-3 text-xs font-semibold text-[#8d4d68]">COGS is missing a cost on at least one line.</p> : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Channel name="Online" bucket={online} />
          <Channel name="The Squishy Shop" bucket={pos} />
        </div>
      </Card>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link href="/inventory" className="rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(80,60,110,0.06)]">
          <p className="text-lg font-extrabold text-[#2f6fe0]">Inventory desk</p>
          <p className="mt-1 text-sm text-[#8a8496]">Products, receiving, counts, barcodes, and suppliers.</p>
        </Link>
        <Link href="/labels" className="rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(80,60,110,0.06)]">
          <p className="text-lg font-extrabold text-[#2f6fe0]">Needs labels ({labelCount})</p>
          <p className="mt-1 text-sm text-[#8a8496]">Print the deliveries that do not have labels yet.</p>
        </Link>
        <Link href="/quality" className="rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(80,60,110,0.06)]">
          <p className="text-lg font-extrabold text-[#2f6fe0]">Needs a look ({issues + unlinked})</p>
          <p className="mt-1 text-sm text-[#8a8496]">{issues} identifier or cost issue{issues === 1 ? "" : "s"}. {unlinked} incoming {unlinked === 1 ? "item needs" : "items need"} a product. {openOrders} purchase orders are waiting on a delivery.</p>
        </Link>
      </div>
      <h2 className="mb-2 mt-6 text-sm font-extrabold text-[#8a8496]">Latest sales</h2>
      <Card className="divide-y divide-[#f3eef6] p-0">
        {dayOrders.length === 0 ? <p className="p-4 text-sm text-[#8a8496]">No sales yet today.</p> : null}
        {dayOrders.slice(0, 6).map((order) => {
          const total = order.lines.reduce((sum, line) => sum + line.qty * line.unitPriceCents, 0);
          return (
            <div key={order.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-extrabold">{order.name}</p>
                <p className="text-xs text-[#8a8496]">{formatWhen(order.processedAt)} · {channelLabel(order.channel)}</p>
              </div>
              <Badge>{formatMoney(total)}</Badge>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-xs font-bold text-[#8a8496]">{label}</p>
    </div>
  );
}

function Channel({ name, bucket }: { name: string; bucket: ReturnType<typeof summarize> }) {
  return (
    <div className="rounded-2xl bg-[#f7f4fb] px-3 py-3">
      <p className="text-sm font-extrabold">{name}</p>
      <p className="mt-1 text-xs text-[#8a8496]">{formatMoney(bucket.sales)} sales · {formatMoney(bucket.cogs)} COGS · {formatPercent(bucket.margin)}</p>
    </div>
  );
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

function qualityCount(variants: { ssSku: string; ssBarcode: string; costCents: number | null }[]) {
  const skus = new Map<string, number>();
  const barcodes = new Map<string, number>();
  let missing = 0;
  for (const variant of variants) {
    if (variant.ssSku) skus.set(variant.ssSku, (skus.get(variant.ssSku) || 0) + 1);
    if (variant.ssBarcode) barcodes.set(variant.ssBarcode, (barcodes.get(variant.ssBarcode) || 0) + 1);
    if (variant.costCents == null) missing += 1;
  }
  const dupSku = [...skus.values()].filter((count) => count > 1).length;
  const dupBarcode = [...barcodes.values()].filter((count) => count > 1).length;
  return dupSku + dupBarcode + missing;
}
