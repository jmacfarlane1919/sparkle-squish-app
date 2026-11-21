import { getSession } from "@/lib/auth";
import { renderLabels } from "@/lib/labels/render";

export const runtime = "nodejs";

type PreviewItem = { name: string; price: string; sku: string; barcode: string };

function readItems(value: unknown): PreviewItem[] | null {
  if (!value || typeof value !== "object" || !("items" in value)) return null;
  const rows = (value as { items?: unknown }).items;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 80) return null;
  const items: PreviewItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") return null;
    const item = row as Record<string, unknown>;
    const name = String(item.name || "").trim();
    const barcode = String(item.barcode || "").trim();
    if (!name || !barcode) return null;
    items.push({
      name,
      price: String(item.price || ""),
      sku: String(item.sku || ""),
      barcode,
    });
  }
  return items;
}

/** One 40 × 20 mm page per label. Does not change the queue. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Sign in required.", { status: 401 });
  const items = readItems(await request.json().catch(() => null));
  if (!items) return new Response("Choose at least one label.", { status: 400 });
  const pdf = await renderLabels(items.map((item) => ({ ...item, qty: 1 })), "niimbot-40x20");
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "no-store",
    },
  });
}
