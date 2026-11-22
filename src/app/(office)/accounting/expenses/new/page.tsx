import { ActionForm } from "@/components/action-form";
import { Notice, PageIntro } from "@/components/bits";
import { BooksLines } from "@/components/books-lines";
import { CustomFields } from "@/components/custom-fields";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { saveExpense } from "@/server/actions/accounting";
import { accountMap } from "@/server/ledger";

export const metadata = { title: "New expense" };

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const [{ rows, byKey }, suppliers, fields] = await Promise.all([
    accountMap(),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    prisma.customField.findMany({ where: { entity: "expense" }, orderBy: { sortOrder: "asc" } }),
  ]);
  const payFrom = rows.filter((account) => account.active && (account.type === "asset" || account.type === "liability"));
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="New expense" subtitle="What you paid, which account paid it, and what it was for." />
      <Notice error={params.error} />
      <ActionForm action={saveExpense} className="space-y-3 rounded-[22px] bg-white p-4">
        <label className="block text-sm font-extrabold">Date<input name="date" type="date" required className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <label className="block text-sm font-extrabold">Who you paid<input name="vendor" required className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <label className="block text-sm font-extrabold">Saved supplier, if any
          <select name="supplierId" className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3">
            <option value="">None</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-extrabold">Which account paid?
          <select name="paymentAccountId" className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" defaultValue={byKey.get("member")?.id || byKey.get("checking")?.id}>
            {payFrom.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </label>
        <BooksLines
          accounts={rows.filter((account) => account.active).map((account) => ({ id: account.id, code: account.code, name: account.name, type: account.type, systemKey: account.systemKey }))}
          inventoryId={byKey.get("supplies")?.id || rows[0]?.id || ""}
          equipmentId={byKey.get("fixed_assets")?.id || ""}
        />
        <label className="block text-sm font-extrabold">Where you bought it<input name="whereName" placeholder="Store or website" className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <label className="block text-sm font-extrabold">Website<input name="whereUrl" type="url" placeholder="https://" className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <label className="block text-sm font-extrabold">Address<input name="whereAddress" className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <label className="block text-sm font-extrabold">Note<input name="memo" className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3" /></label>
        <label className="block text-sm font-extrabold">Receipt photos
          <input name="files" type="file" accept="image/*,.pdf" multiple className="mt-1 block w-full text-sm" />
          <span className="mt-1 block text-xs font-semibold text-[#8a8496]">If file storage is not set up, the expense will not be saved and you will see why.</span>
        </label>
        <CustomFields fields={fields.map((field) => ({ ...field, value: "" }))} />
        <Button type="submit">Save expense</Button>
      </ActionForm>
    </div>
  );
}
