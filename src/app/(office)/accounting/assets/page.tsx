import Link from "next/link";
import { PageIntro } from "@/components/bits";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { dayStamp } from "@/server/ledger";

export const metadata = { title: "Equipment" };

export default async function AssetsPage() {
  const assets = await prisma.asset.findMany({ orderBy: { purchaseDate: "desc" }, include: { account: true } });
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Equipment" subtitle="Things you keep. Product you will sell stays in Inventory, not on this list. Depreciation is off until you turn it on for an item." />
      <p className="mb-3 text-sm"><a className="font-extrabold text-[#2f6fe0]" href="/api/accounting/export?kind=assets">Download CSV</a></p>
      <ul className="space-y-2">
        {assets.map((asset) => (
          <li key={asset.id}>
            <Link href={`/accounting/assets/${asset.id}`} className="block rounded-[22px] bg-white px-4 py-3">
              <p className="font-extrabold">{asset.name}</p>
              <p className="text-sm">{formatMoney(asset.costCents)} · {dayStamp(asset.purchaseDate)}</p>
              <p className="text-xs text-[#8a8496]">{asset.account.name}{asset.whereName ? ` · ${asset.whereName}` : ""}{asset.depreciate ? " · depreciation on" : ""}</p>
            </Link>
          </li>
        ))}
        {assets.length === 0 ? <li className="text-sm text-[#8a8496]">Nothing yet. Mark a line as equipment on an expense or a bill.</li> : null}
      </ul>
    </div>
  );
}
