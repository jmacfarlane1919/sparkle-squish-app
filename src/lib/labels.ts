import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ean13Bits } from "@/lib/ean13-bars";

export type LabelItem = {
  title: string;
  price: string;
  sku: string;
  barcode: string;
};

function drawBarcode(page: import("pdf-lib").PDFPage, bits: string, x: number, y: number, width: number, height: number) {
  const moduleWidth = width / bits.length;
  let cursor = x;
  for (const bit of bits) {
    if (bit === "1") {
      page.drawRectangle({ x: cursor, y, width: moduleWidth + 0.15, height, color: rgb(0.12, 0.1, 0.16) });
    }
    cursor += moduleWidth;
  }
}

export async function renderLabels(items: LabelItem[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const labelWidth = 189;
  const labelHeight = 72;
  const perPage = 30;

  for (let start = 0; start < Math.max(items.length, 1); start += perPage) {
    const page = pdf.addPage([612, 792]);
    const slice = items.slice(start, start + perPage);
    slice.forEach((item, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 13.5 + column * (labelWidth + 9);
      const y = 792 - 36 - (row + 1) * labelHeight;
      const title = item.title.length > 28 ? `${item.title.slice(0, 27)}…` : item.title;
      page.drawText("SPARKLE & SQUISH", { x: x + 8, y: y + 58, size: 6, font: bold, color: rgb(0.42, 0.32, 0.62) });
      page.drawText(title, { x: x + 8, y: y + 47, size: 8, font: bold, color: rgb(0.17, 0.15, 0.25) });
      page.drawText(item.price, { x: x + 140, y: y + 47, size: 8, font: bold, color: rgb(0.18, 0.43, 0.88) });
      const bits = ean13Bits(item.barcode);
      drawBarcode(page, bits, x + 16, y + 18, 150, 24);
      page.drawText(item.barcode, { x: x + 48, y: y + 9, size: 7, font, color: rgb(0.17, 0.15, 0.25) });
      page.drawText(item.sku, { x: x + 8, y: y + 2, size: 6, font, color: rgb(0.45, 0.42, 0.52) });
    });
    if (!slice.length) {
      page.drawText("No labels selected.", { x: 48, y: 740, size: 12, font });
    }
  }
  return pdf.save();
}
