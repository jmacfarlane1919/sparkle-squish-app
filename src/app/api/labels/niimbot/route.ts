import { getSession } from "@/lib/auth";
import { buildNiimbotWorkbook } from "@/lib/labels/niimbot";
import { saveQueueQuantities } from "@/server/actions/labels";
import { queueRows } from "@/server/label-queue";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Sign in required.", { status: 401 });
  const form = await request.formData();
  try {
    const qtys = JSON.parse(String(form.get("qtys") || "[]")) as { id?: string; qty?: number }[];
    const clean = qtys
      .map((row) => ({ id: String(row.id || ""), qty: Number(row.qty) }))
      .filter((row) => row.id && Number.isInteger(row.qty) && row.qty >= 0 && row.qty <= 500);
    await saveQueueQuantities(clean);
  } catch {
    // The saved counts are used when the form does not include edits.
  }
  const items = await queueRows("needs_labels");
  const file = await buildNiimbotWorkbook(
    items.map((item) => ({
      name: item.name,
      price: item.price,
      sku: item.sku,
      barcode: item.barcode,
      qty: item.printQty,
    })),
  );
  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="niimbot-labels.xlsx"',
    },
  });
}
