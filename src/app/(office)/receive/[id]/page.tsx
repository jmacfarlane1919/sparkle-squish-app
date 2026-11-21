import { BackLink, Field, Notice, PageIntro } from "@/components/bits";
import { ScanField } from "@/components/scan-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/db";
import { formatMoney, formatWhen } from "@/lib/format";
import { matchField } from "@/lib/identifiers";
import { addPurchaseOrderLine, lookupReceiveCode, markOrdered, receiveLine } from "@/server/actions/purchasing";
import { notFound } from "next/navigation";

const selectClass = "h-11 w-full rounded-2xl border border-[#e4dced] bg-white px-3 text-base";

export default async function PurchaseOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string; code?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      location: true,
      receipts: { include: { lines: true }, orderBy: { receivedAt: "desc" } },
      lines: { include: { variant: { include: { product: true } } } },
    },
  });
  if (!order) notFound();
  const code = (query.code || "").trim();
  const matched = code ? order.lines.filter((line) => line.variant && matchField(line.variant, code)) : [];
  const variants = await prisma.variant.findMany({ include: { product: true }, orderBy: { product: { title: "asc" } } });
  const canReceive = order.status === "ordered" || order.status === "partial";

  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/receive">Receive</BackLink>
      <PageIntro title={order.number} subtitle={`${order.supplier.name} · ${order.location.name}${order.invoiceNumber ? ` · invoice ${order.invoiceNumber}` : ""}`} />
      <Notice notice={query.notice} error={query.error} />
      {order.status === "draft" ? (
        <form action={markOrdered} className="mb-4">
          <input type="hidden" name="id" value={order.id} />
          <Button type="submit">Mark ordered</Button>
        </form>
      ) : null}
      {canReceive ? (
        <form action={lookupReceiveCode} className="mb-4 rounded-[22px] bg-white p-4">
          <input type="hidden" name="id" value={order.id} />
          <ScanField label="Scan to receive" />
          <Button className="mt-3" type="submit" variant="secondary">Find the line</Button>
        </form>
      ) : null}
      <div className="space-y-3">
        {order.lines.map((line) => {
          const remaining = line.qtyOrdered - line.qtyReceived;
          const active = matched.some((row) => row.id === line.id);
          return (
            <section key={line.id} className={`rounded-[22px] bg-white p-4 ${active ? "ring-2 ring-[#2f6fe0]" : ""}`}>
              <p className="font-extrabold">{line.description}</p>
              <p className="text-xs text-[#8a8496]">{line.variant?.ssSku} · {line.variant?.ssBarcode}</p>
              <p className="mt-1 text-sm">{line.qtyReceived} of {line.qtyOrdered} received · {formatMoney(line.unitCostCents)} each</p>
              {canReceive && remaining > 0 ? (
                <form action={receiveLine} className="mt-3 flex items-end gap-2">
                  <input type="hidden" name="lineId" value={line.id} />
                  <Field label="Qty">
                    <Input name="qty" type="number" min={1} max={remaining} defaultValue={1} className="w-24" />
                  </Field>
                  <Button type="submit">Check in</Button>
                </form>
              ) : null}
            </section>
          );
        })}
      </div>
      {order.status === "draft" || order.status === "ordered" ? (
        <form action={addPurchaseOrderLine} className="mt-4 space-y-3 rounded-[22px] bg-white p-4">
          <h2 className="font-extrabold text-[#2f6fe0]">Add a line</h2>
          <input type="hidden" name="id" value={order.id} />
          <Field label="Item">
            <select name="variantId" className={selectClass} required>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>{variant.product.title} · {variant.ssSku}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty"><Input name="qty" type="number" min={1} defaultValue={1} required /></Field>
            <Field label="Unit cost"><Input name="cost" inputMode="decimal" placeholder="5.25" required /></Field>
          </div>
          <Button type="submit" variant="secondary">Add line</Button>
        </form>
      ) : null}
      <h2 className="mb-2 mt-6 text-sm font-extrabold text-[#8a8496]">Receipts</h2>
      {order.receipts.map((receipt) => (
        <p key={receipt.id} className="mb-2 rounded-2xl bg-white px-4 py-3 text-sm">
          <span className="font-extrabold">{formatWhen(receipt.receivedAt)}</span> · {receipt.note}
          <span className="mt-1 block text-xs text-[#8a8496]">Shopify: {receipt.shopifyStatus}</span>
        </p>
      ))}
    </div>
  );
}
