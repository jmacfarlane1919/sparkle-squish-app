import { BackLink, Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { isOwnerEmail } from "@/server/invoice-import";

export const metadata = { title: "Import invoices" };

export default async function ImportInvoicesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const session = await getSession();
  const owner = Boolean(session && isOwnerEmail(session.email));

  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/invoices">Invoices</BackLink>
      <PageIntro
        title="Import invoices"
        subtitle="Upload the CSV and a zip of the original files. You review every match before anything is saved."
      />
      <Notice error={params.error} />
      {owner ? (
        <form action="/api/invoices/import" method="post" encType="multipart/form-data" className="space-y-4 rounded-[22px] bg-white p-4">
          <label className="block text-sm font-extrabold">
            Invoice CSV
            <input name="csv" type="file" accept=".csv,text/csv" required className="mt-1.5 block w-full text-sm" />
            <span className="mt-1 block text-xs font-semibold text-[#8a8496]">Columns: Supplier, Invoice number, Date, Status, Amount USD, Category. Paid from, subtotal, discount, shipping, and tax are optional.</span>
          </label>
          <label className="block text-sm font-extrabold">
            Attachment zip
            <input name="zip" type="file" accept=".zip,application/zip" required className="mt-1.5 block w-full text-sm" />
            <span className="mt-1 block text-xs font-semibold text-[#8a8496]">PDF, PNG, and JPEG files. A file is matched when its name contains the invoice number.</span>
          </label>
          <Button type="submit">Review import</Button>
        </form>
      ) : (
        <p className="rounded-[22px] bg-white p-4 text-sm text-[#8a8496]">Only the owner can import invoices.</p>
      )}
    </div>
  );
}
