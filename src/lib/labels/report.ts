import { PDFDocument, StandardFonts } from "pdf-lib";
import type { LabelContent } from "@/lib/labels/template";

export type LabelReportRow = LabelContent & {
  receivedOn: string;
  qty: number;
  source: string;
};

export function labelsToCsv(rows: LabelReportRow[]) {
  const header = ["received_on", "product", "price", "s_s_sku", "s_s_barcode", "labels", "source"];
  const lines = rows.map((row) =>
    [row.receivedOn, row.name, row.price, row.sku, row.barcode, String(row.qty), row.source]
      .map((value) => `"${value.replaceAll('"', '""')}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export async function renderLabelReport(rows: LabelReportRow[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageHeight = 792;
  const pageWidth = 612;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = 750;
  const write = (text: string, size: number, useBold = false) => {
    if (y < 48) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = 750;
    }
    page.drawText(text, { x: 40, y, size, font: useBold ? bold : font });
    y -= size + 6;
  };
  write("Labels to print", 16, true);
  write("Sparkle & Squish", 10);
  y -= 6;
  if (!rows.length) write("Nothing is waiting for labels.", 11);
  for (const row of rows) {
    write(`${row.receivedOn}  ·  ${row.qty}  ·  ${row.name}`, 11, true);
    write(`${row.sku}  ·  ${row.barcode}  ·  ${row.price}`, 9);
  }
  return pdf.save();
}
