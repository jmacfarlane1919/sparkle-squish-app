import { BackLink, Field, Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/db";
import { createProduct } from "@/server/actions/products";

const selectClass = "h-11 w-full rounded-2xl border border-[#e4dced] bg-white px-3 text-base";

export const metadata = { title: "New product" };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const [categories, suppliers] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/products">Products</BackLink>
      <PageIntro title="New product" subtitle="S&S Software assigns the S&S SKU and barcode when you save. The supplier SKU and UPC stay in their own fields." />
      <Notice error={params.error} />
      <form action={createProduct} className="space-y-4 rounded-[22px] bg-white p-4">
        <Field label="Name"><Input name="title" required placeholder="Peach Mochi Bear" /></Field>
        <Field label="Category" hint="The code becomes the middle of the SKU, like SS-SQ-112-STD.">
          <select name="category" className={selectClass} defaultValue="SQ">
            {categories.map((category) => (
              <option key={category.code} value={category.code}>{category.code} · {category.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Variant code" hint="STD is the usual one. A second copy becomes STD-1.">
          <Input name="variantCode" defaultValue="STD" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price"><Input name="price" inputMode="decimal" placeholder="14.00" required /></Field>
          <Field label="Cost" hint="Leave blank if you do not know it yet."><Input name="cost" inputMode="decimal" placeholder="5.25" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier SKU"><Input name="vendorSku" placeholder="MOCHI-BEAR-PCH" /></Field>
          <Field label="Supplier barcode"><Input name="vendorBarcode" placeholder="810045551203" /></Field>
        </div>
        <Field label="Supplier">
          <select name="supplierId" className={selectClass} defaultValue="">
            <option value="">None yet</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </Field>
        <Field label="Description"><Textarea name="description" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand"><Input name="brand" /></Field>
          <Field label="Texture"><Input name="texture" /></Field>
          <Field label="Season"><Input name="season" /></Field>
          <Field label="Size"><Input name="size" /></Field>
          <Field label="Material"><Input name="material" /></Field>
          <Field label="Age guidance"><Input name="ageGuidance" placeholder="3+" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="newArrival" className="h-4 w-4" /> New arrival
        </label>
        <Button type="submit">Create and assign S&S codes</Button>
      </form>
    </div>
  );
}
