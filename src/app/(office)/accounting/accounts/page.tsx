import { Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { deactivateAccount, saveAccount } from "@/server/actions/accounting";
import { accountMap } from "@/server/ledger";

export const metadata = { title: "Account list" };

const types = ["asset", "liability", "equity", "income", "cogs", "expense"];
const labels: Record<string, string> = {
  asset: "What you own",
  liability: "What you owe",
  equity: "Owner's stake",
  income: "Money in",
  cogs: "Cost of product sold",
  expense: "Other costs",
};

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const params = await searchParams;
  const { rows } = await accountMap();
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Account list" subtitle="Each number is a GL code. Hide a category if you stop using it. Ones with history stay in old reports." />
      <Notice notice={params.notice} error={params.error} />
      <ul className="space-y-2">
        {rows.map((account) => (
          <li key={account.id} className="rounded-[22px] bg-white p-4">
            <form action={saveAccount} className="space-y-2">
              <input type="hidden" name="id" value={account.id} />
              <div className="grid grid-cols-3 gap-2">
                <input name="code" defaultValue={account.code} className="h-10 rounded-2xl border border-[#e4dced] px-2 font-extrabold" />
                <input name="name" defaultValue={account.name} className="col-span-2 h-10 rounded-2xl border border-[#e4dced] px-2" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select name="type" defaultValue={account.type} className="h-10 rounded-2xl border border-[#e4dced] px-2 text-sm">
                  {types.map((type) => <option key={type} value={type}>{labels[type]}</option>)}
                </select>
                <select name="parentId" defaultValue={account.parentId || ""} className="h-10 rounded-2xl border border-[#e4dced] px-2 text-sm">
                  <option value="">No parent</option>
                  {rows.filter((row) => row.id !== account.id).map((row) => <option key={row.id} value={row.id}>{row.code} {row.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" name="contra" value="yes" defaultChecked={account.contra} /> This amount reduces its group
              </label>
              <input type="hidden" name="active" value={account.active ? "yes" : "no"} />
              <div className="flex gap-2">
                <Button type="submit" variant="secondary">Save</Button>
              </div>
            </form>
            <form action={deactivateAccount} className="mt-2">
              <input type="hidden" name="id" value={account.id} />
              <button className="text-xs font-extrabold text-[#8a8496]" type="submit">{account.active ? "Hide this category" : "Show again"}</button>
            </form>
          </li>
        ))}
      </ul>
      <form action={saveAccount} className="mt-4 space-y-2 rounded-[22px] bg-white p-4">
        <h2 className="font-extrabold">Add a category</h2>
        <input name="code" placeholder="Number, like 6800" className="h-11 w-full rounded-2xl border border-[#e4dced] px-3" required />
        <input name="name" placeholder="Name" className="h-11 w-full rounded-2xl border border-[#e4dced] px-3" required />
        <select name="type" className="h-11 w-full rounded-2xl border border-[#e4dced] px-3">
          {types.map((type) => <option key={type} value={type}>{labels[type]}</option>)}
        </select>
        <Button type="submit">Add</Button>
      </form>
    </div>
  );
}
