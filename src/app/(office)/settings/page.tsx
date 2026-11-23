import Link from "next/link";
import { Field, Notice, PageIntro, Shown } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/db";
import { SHOP, getAppUrl, shopifyDomain, shouldLoadDemo } from "@/lib/env";
import { getSession } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/owner";
import { FEATURES } from "@/lib/features";
import { NEXT_FREE_BARCODE, allocateBarcode } from "@/lib/identifiers";
import { DEFAULT_LABELS_PRINTED_THROUGH } from "@/lib/labels/queue";
import { ShopifyImport } from "@/components/shopify-import";
import { checkFileStorage, clearSampleData, previewFeature, reloadDemo, runBackup, runReconcile, saveCategory, saveLabelCutoff, toggleFeature, toggleNiimbotBluetooth } from "@/server/actions/settings";
import { describeShopifyConnection } from "@/server/shopify-token";
import { importStatus } from "@/server/shopify-sync";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const params = await searchParams;
  const session = await getSession();
  const owner = Boolean(session && (await isOwnerEmail(session.email)));
  const [flags, categories, counter, barcodes, lastBackup, labelCutoff, bluetooth, runs] = await Promise.all([
    prisma.featureFlag.findMany(),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.barcodeCounter.findUnique({ where: { id: "series" } }),
    prisma.variant.findMany({ select: { ssBarcode: true } }),
    prisma.appSetting.findUnique({ where: { key: "last_backup" } }),
    prisma.appSetting.findUnique({ where: { key: "labels_printed_through" } }),
    prisma.appSetting.findUnique({ where: { key: "niimbot_bluetooth" } }),
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
  ]);
  const nextBarcode = counter ? allocateBarcode(counter.lastIssued, barcodes.map((row) => row.ssBarcode).filter(Boolean)) : NEXT_FREE_BARCODE;
  const shopify = await describeShopifyConnection();
  const importing = await importStatus();
  const byKey = new Map(flags.map((flag) => [flag.key, flag.enabled]));

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageIntro title="Settings" subtitle="Turn Shopify writes on one area at a time. Each one starts off and can be previewed first." />
      <Notice notice={params.notice} error={params.error} />
      <section className="rounded-[22px] bg-white p-4 text-sm">
        <h2 className="font-extrabold text-[#2f6fe0]">Shop</h2>
        <p className="mt-2">{SHOP.name} · <Shown value={shopifyDomain()} setting="SHOPIFY_STORE_DOMAIN" /></p>
        <p className="text-[#8a8496]">{SHOP.publicUrl} · USD · America/Chicago · API <Shown value={SHOP.apiVersion} setting="SHOPIFY_API_VERSION" /></p>
        <p className={`mt-2 font-bold ${shopify.ok ? "text-[#14685a]" : "text-[#8a5a12]"}`}>{shopify.headline}</p>
        {shopify.detail ? <p className="text-[#8a8496]"><Shown value={shopify.detail} /></p> : null}
        <p className="text-[#8a8496]">App URL for webhooks: <Shown value={getAppUrl()} setting="APP_URL" />/api/webhooks/shopify</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={runReconcile}><Button type="submit" variant="outline">Reconcile now</Button></form>
          <form action={runBackup}><Button type="submit" variant="outline">Back up now</Button></form>
        </div>
        <ShopifyImport initial={importing} />
        {lastBackup ? <p className="mt-2 text-xs text-[#8a8496]">Last backup: <Shown value={lastBackup.value} /></p> : null}
      </section>
      <section className="rounded-[22px] bg-white p-4">
        <h2 className="font-extrabold text-[#2f6fe0]">S&S barcode series</h2>
        <p className="mt-2 text-sm">Last issued {counter?.lastIssued}. Next free {nextBarcode}.</p>
        <p className="mt-1 text-xs text-[#8a8496]">Codes only move forward. A used code is never given out again.</p>
      </section>
      <section className="rounded-[22px] bg-white p-4">
        <h2 className="font-extrabold text-[#2f6fe0]">Labels printed through</h2>
        <p className="mt-1 text-sm text-[#8a8496]">Everything delivered on this date or earlier is already labeled. A Shopify import puts later received dates into Needs labels.</p>
        <form action={saveLabelCutoff} className="mt-3 flex items-end gap-2">
          <Field label="Date">
            <Input name="cutoff" type="date" defaultValue={labelCutoff?.value || DEFAULT_LABELS_PRINTED_THROUGH} required />
          </Field>
          <Button type="submit" variant="secondary">Save</Button>
        </form>
      </section>
      <section className="rounded-[22px] bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-[#2f6fe0]">Print to NIIMBOT</h2>
            <p className="mt-1 text-sm text-[#8a8496]">Experimental. Chrome on a computer or Android can send the 40 × 20 mm label over Bluetooth. iPhone Safari cannot. Sending does not mark labels printed.</p>
          </div>
          <span className={`rounded-full px-2 py-1 text-[11px] font-extrabold ${bluetooth?.value === "on" ? "bg-[#d4f1ea] text-[#14685a]" : "bg-[#f3eef6] text-[#8a8496]"}`}>
            {bluetooth?.value === "on" ? "On" : "Off"}
          </span>
        </div>
        <form action={toggleNiimbotBluetooth} className="mt-3">
          <Button type="submit" variant="outline">{bluetooth?.value === "on" ? "Turn off" : "Turn on"}</Button>
        </form>
      </section>
      <section className="rounded-[22px] bg-white p-4">
        <h2 className="font-extrabold text-[#2f6fe0]">Categories</h2>
        <p className="mt-1 text-xs text-[#8a8496]">SQ, FG, and SL already have names. CY, GM, and SP are in use. Rename them here.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {categories.map((category) => <li key={category.code} className="font-bold">{category.code} · {category.name}</li>)}
        </ul>
        <form action={saveCategory} className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Code"><Input name="code" placeholder="CY" required /></Field>
          <Field label="Name"><Input name="name" placeholder="Crystal" required /></Field>
          <Button className="col-span-2" type="submit" variant="secondary">Save category</Button>
        </form>
      </section>
      {FEATURES.map((feature) => (
        <section key={feature.key} className="rounded-[22px] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-extrabold">{feature.label}</h2>
              <p className="mt-1 text-sm text-[#8a8496]">{feature.description}</p>
            </div>
            <span className={`rounded-full px-2 py-1 text-[11px] font-extrabold ${byKey.get(feature.key) ? "bg-[#d4f1ea] text-[#14685a]" : "bg-[#f3eef6] text-[#8a8496]"}`}>
              {byKey.get(feature.key) ? "On" : "Off"}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <form action={previewFeature}>
              <input type="hidden" name="feature" value={feature.key} />
              <Button type="submit" variant="secondary">Dry-run preview</Button>
            </form>
            <form action={toggleFeature}>
              <input type="hidden" name="feature" value={feature.key} />
              <Button type="submit" variant="outline">{byKey.get(feature.key) ? "Turn off" : "Turn on"}</Button>
            </form>
          </div>
        </section>
      ))}
      <section className="rounded-[22px] bg-white p-4 text-sm">
        <h2 className="font-extrabold text-[#2f6fe0]">Recent syncs</h2>
        <ul className="mt-2 space-y-2">
          {runs.map((run) => <li key={run.id}>{run.kind} · {run.status} · <Shown value={run.detail} /></li>)}
          {runs.length === 0 ? <li className="text-[#8a8496]">No syncs yet.</li> : null}
        </ul>
        <p className="mt-3"><Link className="font-extrabold text-[#2f6fe0]" href="/audit">Open the audit log</Link></p>
        <p className="mt-1"><Link className="font-extrabold text-[#2f6fe0]" href="/import">Import a CSV from the old prototype</Link></p>
      </section>
      {owner ? (
        <section className="space-y-3 rounded-[22px] bg-white p-4">
          <h2 className="font-extrabold">File storage</h2>
          <p className="text-sm text-[#8a8496]">Checks that receipt photos can be saved and read back. It does not show your keys.</p>
          <form action={checkFileStorage}><Button type="submit" variant="secondary">Check file storage</Button></form>
        </section>
      ) : null}
      {owner ? (
        <form action={clearSampleData} className="rounded-[22px] bg-white p-4">
          <h2 className="font-extrabold">Clear sample shop</h2>
          <p className="mt-1 text-sm text-[#8a8496]">Removes only the built-in sample products, suppliers, purchase orders, and demo sales. A product already linked to Shopify is kept. Press the button once to see if any sample rows are there, then check the box and press it again to remove them.</p>
          <label className="mt-3 flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" name="confirm" value="yes" /> Remove the sample rows
          </label>
          <Button className="mt-3" type="submit" variant="outline">Clear sample data</Button>
        </form>
      ) : null}
      {shouldLoadDemo() ? (
        <form action={reloadDemo} className="rounded-[22px] bg-white p-4">
          <h2 className="font-extrabold">Reload the sample shop</h2>
          <p className="mt-1 text-sm text-[#8a8496]">This replaces the catalog, orders, and purchase orders with the demo data.</p>
          <label className="mt-3 flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" name="confirm" value="yes" /> Replace the catalog
          </label>
          <Button className="mt-3" type="submit" variant="outline">Reload demo data</Button>
        </form>
      ) : null}
    </div>
  );
}
