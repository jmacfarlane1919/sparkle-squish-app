import { getSession } from "@/lib/auth";
import { labelsToCsv, renderLabelReport, type LabelReportRow } from "@/lib/labels/report";
import { queueRows } from "@/server/label-queue";
import { saveQueueQuantities } from "@/server/actions/labels";

export const runtime = "nodejs";

async function rows(): Promise<LabelReportRow[]> {
  const items = await queueRows("needs_labels");
  return items.map((item) => ({
    name: item.name,
    price: item.price,
    sku: item.sku,
    barcode: item.barcode,
    receivedOn: item.receivedOn,
    qty: item.printQty,
    source: item.source,
  }));
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Sign in required.", { status: 401 });
  return send(new URL(request.url).searchParams.get("format") || "csv", await rows());
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Sign in required.", { status: 401 });
  const form = await request.formData();
  const format = new URL(request.url).searchParams.get("format") || String(form.get("format") || "csv");
  try {
    const qtys = JSON.parse(String(form.get("qtys") || "[]")) as { id?: string; qty?: number }[];
    const clean = qtys
      .map((row) => ({ id: String(row.id || ""), qty: Number(row.qty) }))
      .filter((row) => row.id && Number.isInteger(row.qty) && row.qty >= 0 && row.qty <= 500);
    await saveQueueQuantities(clean);
  } catch {
    // A report without edited counts still lists the saved queue.
  }
  return send(format, await rows());
}

function send(format: string, reportRows: LabelReportRow[]) {
  if (format === "pdf") {
    return renderLabelReport(reportRows).then(
      (pdf) =>
        new Response(Buffer.from(pdf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="labels-to-print.pdf"',
          },
        }),
    );
  }
  return new Response(labelsToCsv(reportRows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="labels-to-print.csv"',
    },
  });
}
