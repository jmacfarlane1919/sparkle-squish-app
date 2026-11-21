import { BackLink, Field, Notice, PageIntro } from "@/components/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/db";
import { centsToDollarInput, formatMoney, onHand } from "@/lib/format";
import { buildProductBasicsOperations, describeProductWrite } from "@/lib/shopify/payloads";
import { addVariant, sendBrandedPhoto, sendProduct, updateProduct, uploadPhoto } from "@/server/actions/products";
import { notFound } from "next/navigation";

const selectClass = "h-11 w-full rounded-2xl border border-[#e4dced] bg-white px-3 text-base";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      supplier: true,
      photos: { orderBy: { createdAt: "desc" } },
      variants: { include: { levels: { include: { location: true } } }, orderBy: { position: "asc" } },
    },
  });
  if (!product) notFound();
  const [categories, suppliers] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
  ]);
  const primary = product.variants[0];
  const write = {
    shopifyProductId: product.shopifyProductId,
    title: product.title,
    description: product.description,
    status: (product.status === "draft" || product.status === "archived" ? product.status : "active") as "active" | "draft" | "archived",
    brand: product.brand,
    texture: product.texture,
    season: product.season,
    size: product.size,
    material: product.material,
    ageGuidance: product.ageGuidance,
    newArrival: product.newArrival,
    receivedAt: product.receivedAt ? product.receivedAt.toISOString().slice(0, 10) : null,
    variants: product.variants.map((variant) => ({
      shopifyVariantId: variant.shopifyVariantId,
      priceCents: variant.priceCents,
      vendorSku: variant.vendorSku,
      vendorBarcode: variant.vendorBarcode,
      ssSku: variant.ssSku,
      ssBarcode: variant.ssBarcode,
      title: variant.title === "Default" ? "Default Title" : variant.title,
    })),
  };
  const operations = buildProductBasicsOperations(write);

  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/products">Products</BackLink>
      <PageIntro title={product.title} subtitle={product.categoryCode ? `${product.categoryCode} · ${product.status}` : product.status} />
      <Notice notice={query.notice} error={query.error} />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {product.photos.map((photo) => (
          <div key={photo.id} className="w-28 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photos/${photo.id}`} alt={photo.alt} className="h-28 w-28 rounded-2xl object-cover" />
            <p className="mt-1 text-center text-[11px] font-bold text-[#8a8496]">{photo.role}</p>
          </div>
        ))}
      </div>
      {product.variants.map((variant) => (
        <section key={variant.id} className="mb-3 rounded-[22px] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-[#1f8a78]">S&S identifiers</p>
              <p className="mt-1 text-lg font-extrabold">{variant.ssSku}</p>
              <p className="font-bold text-[#2f6fe0]">{variant.ssBarcode}</p>
            </div>
            <Badge>{variant.title}</Badge>
          </div>
          <div className="mt-3 rounded-2xl bg-[#f7f4fb] p-3 text-sm">
            <p className="font-extrabold">Supplier identifiers</p>
            <p className="text-[#8a8496]">SKU {variant.vendorSku || "—"} · barcode {variant.vendorBarcode || "—"}</p>
            <p className="mt-1 text-xs text-[#8a8496]">These stay in Shopify’s own SKU and barcode fields. Saving here does not write those fields.</p>
          </div>
          <p className="mt-3 text-sm">{formatMoney(variant.priceCents)} · cost {formatMoney(variant.costCents)} · {onHand(variant.levels)} on hand</p>
          <ul className="mt-2 text-xs text-[#8a8496]">
            {variant.levels.map((level) => (
              <li key={level.id}>{level.location.name}: {level.available}</li>
            ))}
          </ul>
        </section>
      ))}
      {primary ? (
        <form action={updateProduct} className="space-y-4 rounded-[22px] bg-white p-4">
          <h2 className="font-extrabold text-[#2f6fe0]">Edit</h2>
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="variantId" value={primary.id} />
          <Field label="Name"><Input name="title" defaultValue={product.title} required /></Field>
          <Field label="Status">
            <select name="status" className={selectClass} defaultValue={product.status}>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <Field label="Category">
            <select name="category" className={selectClass} defaultValue={product.categoryCode}>
              {categories.map((category) => <option key={category.code} value={category.code}>{category.code} · {category.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price"><Input name="price" defaultValue={centsToDollarInput(primary.priceCents)} required /></Field>
            <Field label="Cost"><Input name="cost" defaultValue={centsToDollarInput(primary.costCents)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier SKU"><Input name="vendorSku" defaultValue={primary.vendorSku} /></Field>
            <Field label="Supplier barcode"><Input name="vendorBarcode" defaultValue={primary.vendorBarcode} /></Field>
          </div>
          <Field label="Supplier">
            <select name="supplierId" className={selectClass} defaultValue={product.supplierId || ""}>
              <option value="">None</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </Field>
          <Field label="Description"><Textarea name="description" defaultValue={product.description} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand"><Input name="brand" defaultValue={product.brand} /></Field>
            <Field label="Texture"><Input name="texture" defaultValue={product.texture} /></Field>
            <Field label="Season"><Input name="season" defaultValue={product.season} /></Field>
            <Field label="Size"><Input name="size" defaultValue={product.size} /></Field>
            <Field label="Material"><Input name="material" defaultValue={product.material} /></Field>
            <Field label="Age guidance"><Input name="ageGuidance" defaultValue={product.ageGuidance} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" name="newArrival" defaultChecked={product.newArrival} className="h-4 w-4" /> New arrival
          </label>
          <Button type="submit">Save</Button>
        </form>
      ) : null}
      <form action={addVariant} className="mt-4 space-y-3 rounded-[22px] bg-white p-4">
        <h2 className="font-extrabold text-[#2f6fe0]">Another variant</h2>
        <p className="text-xs text-[#8a8496]">Uses the same product number. If STD is taken, the next one is STD-1.</p>
        <input type="hidden" name="productId" value={product.id} />
        <Field label="Name"><Input name="title" placeholder="Mini" /></Field>
        <Field label="Variant code"><Input name="variantCode" defaultValue="STD" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price"><Input name="price" placeholder="12.00" required /></Field>
          <Field label="Cost"><Input name="cost" /></Field>
          <Field label="Supplier SKU"><Input name="vendorSku" /></Field>
          <Field label="Supplier barcode"><Input name="vendorBarcode" /></Field>
        </div>
        <Button type="submit" variant="secondary">Add variant</Button>
      </form>
      <form action={uploadPhoto} className="mt-4 space-y-3 rounded-[22px] bg-white p-4">
        <h2 className="font-extrabold text-[#2f6fe0]">Photos</h2>
        <p className="text-xs text-[#8a8496]">Originals stay in this app. Branded photos are the ones that can go to Shopify.</p>
        <input type="hidden" name="productId" value={product.id} />
        <Field label="Which photo">
          <select name="role" className={selectClass} defaultValue="original">
            <option value="original">Original, keep it here</option>
            <option value="branded">S&S branded, can go to Shopify</option>
          </select>
        </Field>
        <Input name="file" type="file" accept="image/*" required />
        <Button type="submit" variant="secondary">Upload</Button>
      </form>
      {product.photos.filter((photo) => photo.role === "branded").map((photo) => (
        <form key={photo.id} action={sendBrandedPhoto} className="mt-2">
          <input type="hidden" name="photoId" value={photo.id} />
          <input type="hidden" name="productId" value={product.id} />
          <Button type="submit" variant="outline">Send branded photo to Shopify</Button>
        </form>
      ))}
      <section className="mt-4 rounded-[22px] border border-[#d4f1ea] bg-[#f3fbf8] p-4">
        <h2 className="font-extrabold text-[#1f8a78]">Shopify preview</h2>
        <p className="mt-2 text-sm leading-relaxed">{describeProductWrite(write)}</p>
        <form action={sendProduct} className="mt-3">
          <input type="hidden" name="id" value={product.id} />
          <Button type="submit" variant="secondary">Send this to Shopify</Button>
        </form>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-extrabold text-[#1f8a78]">Show the write</summary>
          <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed">{JSON.stringify(operations, null, 2)}</pre>
        </details>
      </section>
    </div>
  );
}
