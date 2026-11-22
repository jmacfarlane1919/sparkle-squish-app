import { notFound } from "next/navigation";
import { BackLink, Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { postAssetDepreciation, setAssetLife } from "@/server/actions/accounting";
import { dayStamp } from "@/server/ledger";

export default async function AssetDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const asset = await prisma.asset.findUnique({ where: { id }, include: { account: true, files: true, expenseLine: true, invoiceLine: true } });
  if (!asset) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/accounting/assets">Equipment</BackLink>
      <PageIntro title={asset.name} subtitle={`${dayStamp(asset.purchaseDate)} · ${formatMoney(asset.costCents)}`} />
      <Notice notice={query.notice} error={query.error} />
      <section className="space-y-1 rounded-[22px] bg-white p-4 text-sm">
        <p>Filed under {asset.account.code} {asset.account.name}</p>
        {asset.whereName ? <p>Bought at {asset.whereName}</p> : null}
        {asset.whereUrl ? <p><a className="font-extrabold text-[#2f6fe0]" href={asset.whereUrl}>{asset.whereUrl}</a></p> : null}
        {asset.whereAddress ? <p>{asset.whereAddress}</p> : null}
        <p>Depreciation posted so far: {formatMoney(asset.depreciatedCents)}</p>
        {asset.expenseLine ? <p><a className="font-extrabold text-[#2f6fe0]" href={`/accounting/expenses/${asset.expenseLine.expenseId}`}>Open the expense</a></p> : null}
        {asset.invoiceLine ? <p><a className="font-extrabold text-[#2f6fe0]" href={`/invoices/${asset.invoiceLine.invoiceId}`}>Open the bill</a></p> : null}
      </section>
      <form action={setAssetLife} className="mt-4 space-y-2 rounded-[22px] bg-white p-4">
        <input type="hidden" name="assetId" value={asset.id} />
        <label className="block text-sm font-extrabold">Useful life in months
          <input name="months" type="number" min={1} defaultValue={asset.usefulLifeMonths || ""} className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" />
        </label>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="depreciate" value="yes" defaultChecked={asset.depreciate} /> Turn on straight-line depreciation
        </label>
        <Button type="submit" variant="secondary">Save</Button>
      </form>
      <form action={postAssetDepreciation} className="mt-3 space-y-2 rounded-[22px] bg-white p-4">
        <input type="hidden" name="assetId" value={asset.id} />
        <label className="block text-sm font-extrabold">Date<input name="date" type="date" required className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <div className="flex gap-2">
          <Button type="submit" name="months" value="1" variant="outline">Post one month</Button>
          <Button type="submit" name="months" value="12" variant="outline">Post one year</Button>
        </div>
      </form>
      <ul className="mt-3 space-y-2">
        {asset.files.map((file) => <li key={file.id}><a className="font-extrabold text-[#2f6fe0]" href={`/api/accounting/files/${file.id}`}>{file.filename}</a></li>)}
      </ul>
    </div>
  );
}
