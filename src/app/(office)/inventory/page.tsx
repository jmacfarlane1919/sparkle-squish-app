import { ClipboardList, Package, PackagePlus, ScanBarcode, Tag, Truck } from "lucide-react";
import { HubCard, PageIntro, StatTile } from "@/components/bits";
import { prisma } from "@/lib/db";
import { formatWhen } from "@/lib/format";

export const metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const [items, openOrders, receipts, ordered] = await Promise.all([
    prisma.variant.count(),
    prisma.purchaseOrder.count({ where: { status: { in: ["draft", "ordered", "partial"] } } }),
    prisma.receipt.findMany({
      orderBy: { receivedAt: "desc" },
      take: 5,
      include: { lines: true, purchaseOrder: { include: { supplier: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { status: { in: ["ordered", "partial"] } },
      include: { lines: { include: { variant: true } } },
    }),
  ]);
  const newProducts = new Set<string>();
  for (const order of ordered) {
    const receivedByProduct = new Map<string, number>();
    for (const line of order.lines) {
      if (!line.variant) continue;
      receivedByProduct.set(line.variant.productId, (receivedByProduct.get(line.variant.productId) || 0) + line.qtyReceived);
    }
    for (const [productId, received] of receivedByProduct) {
      if (received === 0) newProducts.add(productId);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageIntro title="Inventory" subtitle="Products, receiving, counts, barcodes, and suppliers." />
      <div className="grid grid-cols-2 gap-3">
        <HubCard href="/products" title="Products" description="product list, photos & pricing" icon={Package} tile="#e7dff8" ink="#6d4bc3" />
        <HubCard href="/receive" title="Receive inventory" description="check in a delivery" icon={PackagePlus} tile="#f8d5e4" ink="#c4497a" />
        <HubCard href="/counts" title="Inventory count" description="count and update stock" icon={ClipboardList} tile="#d4f1ea" ink="#1f8a78" />
        <HubCard href="/lookup" title="Barcode lookup" description="scan an S&S or supplier barcode" icon={ScanBarcode} tile="#d9e7fb" ink="#3a6fbf" />
        <HubCard href="/suppliers" title="Supplier Management" description="contacts, invoices & purchased items" icon={Truck} tile="#fde4c4" ink="#c47a2b" />
        <HubCard href="/labels" title="Barcode labels" description="print S&S product labels" icon={Tag} tile="#f0d9f6" ink="#a24bb5" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatTile value={items} label="Inventory items" />
        <StatTile value={openOrders} label="Open purchase orders" />
        <StatTile value={newProducts.size} label="New products on order" />
      </div>
      <p className="mt-2 text-center text-[11px] text-[#8a8496]">Open orders include drafts. New products are on ordered or partial POs and have not been received yet.</p>
      <h2 className="mb-2 mt-6 text-sm font-extrabold text-[#8a8496]">Recent receiving</h2>
      <div className="divide-y divide-[#f3eef6] overflow-hidden rounded-[22px] bg-white shadow-[0_8px_24px_rgba(80,60,110,0.06)]">
        {receipts.length === 0 ? <p className="p-4 text-sm text-[#8a8496]">Nothing has been checked in yet.</p> : null}
        {receipts.map((receipt) => {
          const qty = receipt.lines.reduce((sum, line) => sum + line.qty, 0);
          return (
            <a key={receipt.id} href={`/receive/${receipt.purchaseOrderId}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block font-extrabold">{receipt.purchaseOrder.supplier.name}</span>
                <span className="block text-xs text-[#8a8496]">{receipt.purchaseOrder.number} · {receipt.note}</span>
              </span>
              <span className="text-right text-xs font-bold text-[#8a8496]">
                {qty} in
                <span className="mt-0.5 block">{formatWhen(receipt.receivedAt)}</span>
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
