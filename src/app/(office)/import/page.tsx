import { PageIntro } from "@/components/bits";
import { ImportPanel } from "@/components/import-panel";

export const metadata = { title: "CSV import" };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageIntro title="Bring in the old prototype" subtitle="Upload the CSVs from the ChatGPT site. Preview them before anything is saved. Existing S&S SKUs and barcodes are kept when the file already has them." />
      <ImportPanel kind="products" title="Products" sample="/samples/products.csv" hint="Columns: title, category, variant_code, price, cost, vendor_sku, vendor_barcode, ss_sku, ss_barcode, supplier, brand, texture, season, size, material, age_guidance." />
      <ImportPanel kind="suppliers" title="Suppliers" sample="/samples/suppliers.csv" hint="Columns: name, contact_name, email, phone, notes." />
      <ImportPanel kind="orders" title="Purchase orders" sample="/samples/purchase-orders.csv" hint="Columns: po_number, supplier, status, location, sku, qty_ordered, qty_received, unit_cost, invoice, ordered_at. Rows with the same PO number become one order." />
    </div>
  );
}
