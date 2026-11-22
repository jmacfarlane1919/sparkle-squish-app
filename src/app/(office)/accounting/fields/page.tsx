import { Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { hideField, saveField } from "@/server/actions/accounting";

export const metadata = { title: "Extra fields" };

const entities = [
  ["supplier", "Suppliers"],
  ["invoice", "Bills"],
  ["expense", "Expenses"],
];
const types = [
  ["text", "Text"],
  ["number", "Number"],
  ["money", "Money"],
  ["date", "Date"],
  ["yesno", "Yes or no"],
  ["dropdown", "Dropdown"],
  ["url", "Link"],
];

export default async function FieldsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const params = await searchParams;
  const fields = await prisma.customField.findMany({ orderBy: [{ entity: "asc" }, { sortOrder: "asc" }] });
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Extra fields" subtitle="Add your own questions. Hiding a field keeps the answers." />
      <Notice notice={params.notice} error={params.error} />
      <form action={saveField} className="space-y-2 rounded-[22px] bg-white p-4">
        <select name="entity" className="h-11 w-full rounded-2xl border border-[#e4dced] px-3">
          {entities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input name="label" placeholder="Question, like Booth number" required className="h-11 w-full rounded-2xl border border-[#e4dced] px-3" />
        <select name="fieldType" className="h-11 w-full rounded-2xl border border-[#e4dced] px-3">
          {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <textarea name="options" placeholder="Dropdown choices, one per line" className="min-h-20 w-full rounded-2xl border border-[#e4dced] px-3 py-2" />
        <Button type="submit">Add field</Button>
      </form>
      <ul className="mt-4 space-y-2">
        {fields.map((field) => (
          <li key={field.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
            <span>
              <span className="block font-extrabold">{field.label}</span>
              <span className="text-xs text-[#8a8496]">{field.entity} · {field.fieldType}{field.hidden ? " · hidden" : ""}</span>
            </span>
            <form action={hideField}>
              <input type="hidden" name="id" value={field.id} />
              <button className="font-extrabold text-[#2f6fe0]" type="submit">{field.hidden ? "Show" : "Hide"}</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
