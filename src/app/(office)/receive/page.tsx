import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageIntro } from "@/components/bits";
import { prisma } from "@/lib/db";
import { formatWhen } from "@/lib/format";

export const metadata = { title: "Receive inventory" };

const labels: Record<string, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partial: "Partial",
  received: "Received",
  cancelled: "Cancelled",
};

export default async function ReceivePage() {
  const orders = await prisma.purchaseOrder.findMany({
    where: { status: { in: ["draft", "ordered", "partial"] } },
    include: { supplier: true, lines: true, location: true },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Receive inventory" subtitle="Check in a delivery. Receiving adds to the count. It never replaces it." action={<Link href="/purchase-orders/new"><Button>New order</Button></Link>} />
      <div className="space-y-3">
        {orders.map((order) => {
          const ordered = order.lines.reduce((sum, line) => sum + line.qtyOrdered, 0);
          const received = order.lines.reduce((sum, line) => sum + line.qtyReceived, 0);
          return (
            <Link key={order.id} href={`/receive/${order.id}`} className="block rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(80,60,110,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <p className="font-extrabold">{order.supplier.name}</p>
                <Badge>{labels[order.status] || order.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-[#2f6fe0]">{order.number}</p>
              <p className="mt-1 text-xs text-[#8a8496]">{received} of {ordered} received · {order.location.name}</p>
              <p className="mt-1 text-xs text-[#8a8496]">{order.orderedAt ? `Ordered ${formatWhen(order.orderedAt)}` : "Not sent yet"}</p>
            </Link>
          );
        })}
        {orders.length === 0 ? <p className="text-sm text-[#8a8496]">No open purchase orders.</p> : null}
      </div>
    </div>
  );
}
