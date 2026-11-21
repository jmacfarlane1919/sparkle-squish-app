import { PDFDocument, StandardFonts } from "pdf-lib";
import { drawProductLabel, type LabelContent } from "@/lib/labels/template";
import { labelSize } from "@/lib/labels/sizes";

export type PrintableLabel = LabelContent & { qty?: number };

export type PrintedLabel = LabelContent & {
  queueItemId: string;
  qty: number;
};

export function expandLabels(items: PrintableLabel[]) {
  return items.flatMap((item) => {
    const copies = item.qty && item.qty > 0 ? item.qty : 1;
    return Array.from({ length: copies }, () => item);
  });
}

export async function renderLabels(items: PrintableLabel[], sizeId = "avery") {
  const size = labelSize(sizeId);
  const copies = expandLabels(items);
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  if (!copies.length) {
    const page = pdf.addPage([612, 792]);
    page.drawText("No labels selected.", { x: 48, y: 740, size: 12, font: fonts.regular });
    return pdf.save();
  }

  if (size.kind === "roll") {
    for (const item of copies) {
      const page = pdf.addPage([size.width, size.height]);
      drawProductLabel(page, fonts, { x: 0, y: 0, width: size.width, height: size.height }, item);
    }
    return pdf.save();
  }

  const columns = size.columns ?? 3;
  const rows = size.rows ?? 10;
  const perPage = columns * rows;
  const marginX = size.marginX ?? 0;
  const marginY = size.marginY ?? 0;
  const gapX = size.gapX ?? 0;
  const pageWidth = size.pageWidth ?? 612;
  const pageHeight = size.pageHeight ?? 792;

  for (let start = 0; start < copies.length; start += perPage) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    copies.slice(start, start + perPage).forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = marginX + column * (size.width + gapX);
      const y = pageHeight - marginY - (row + 1) * size.height;
      drawProductLabel(page, fonts, { x, y, width: size.width, height: size.height }, item);
    });
  }
  return pdf.save();
}
