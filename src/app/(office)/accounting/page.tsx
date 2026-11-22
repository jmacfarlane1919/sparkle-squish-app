import Link from "next/link";
import { Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { booksLockedThrough } from "@/server/ledger";
import { postShopifyAction, saveLock } from "@/server/actions/accounting";

export const metadata = { title: "Books" };

const links = [
  ["Account list", "/accounting/accounts", "The categories money is filed under."],
  ["New expense", "/accounting/expenses/new", "Something you paid for."],
  ["Expenses", "/accounting/expenses", "Receipts you already entered."],
  ["Adjustments", "/accounting/journal", "A correction that is not a normal expense."],
  ["Reconcile", "/accounting/reconcile", "Match a bank or card statement."],
  ["Reports", "/accounting/reports", "Profit, what you own, and the details."],
  ["Equipment", "/accounting/assets", "Things you keep, not product you sell."],
  ["Extra fields", "/accounting/fields", "Your own questions on suppliers, bills, and expenses."],
];

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const params = await searchParams;
  const lock = await booksLockedThrough();
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Books" subtitle="Where money came from, where it went, and what you still own." />
      <Notice notice={params.notice} error={params.error} />
      <div className="space-y-2">
        {links.map(([title, href, hint]) => (
          <Link key={href} href={href} className="block rounded-[22px] bg-white px-4 py-3">
            <p className="font-extrabold text-[#2f6fe0]">{title}</p>
            <p className="text-sm text-[#8a8496]">{hint}</p>
          </Link>
        ))}
      </div>
      <section className="mt-4 space-y-3 rounded-[22px] bg-white p-4">
        <h2 className="font-extrabold">Shopify sales</h2>
        <p className="text-sm text-[#8a8496]">Posts each day’s product sales, refunds, and product cost from orders already saved here. Sales tax, shipping you charged, and card fees are not in that feed, so enter those yourself.</p>
        <form action={postShopifyAction}><Button type="submit" variant="secondary">Post Shopify sales</Button></form>
      </section>
      <form action={saveLock} className="mt-4 space-y-3 rounded-[22px] bg-white p-4">
        <h2 className="font-extrabold">Lock the books</h2>
        <p className="text-sm text-[#8a8496]">Nothing dated on or before this day can be added. Leave it blank to unlock.</p>
        <input name="lock" type="date" defaultValue={lock} className="h-11 w-full rounded-2xl border border-[#e4dced] px-3" />
        <Button type="submit" variant="outline">Save lock</Button>
      </form>
    </div>
  );
}
