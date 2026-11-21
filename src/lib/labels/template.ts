import { rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ean13Bits } from "@/lib/ean13-bars";

/**
 * Label template.
 *
 * This is the only module that decides how a sticker looks.
 * Replace `drawProductLabel` when the owner's exact layout arrives.
 * The queue, paper sizes, and print history only pass these four fields:
 * product name, price, S&S SKU (custom.s_s_sku), and S&S barcode (custom.s_s_barcode).
 */
export const LABEL_TEMPLATE_ID = "ss-default";

export type LabelContent = {
  name: string;
  price: string;
  sku: string;
  barcode: string;
};

export type LabelFonts = {
  regular: PDFFont;
  bold: PDFFont;
};

export type LabelBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function drawBarcode(page: PDFPage, bits: string, x: number, y: number, width: number, height: number) {
  const moduleWidth = width / bits.length;
  let cursor = x;
  for (const bit of bits) {
    if (bit === "1") {
      page.drawRectangle({ x: cursor, y, width: moduleWidth + 0.2, height, color: rgb(0.12, 0.1, 0.16) });
    }
    cursor += moduleWidth;
  }
}

export function drawProductLabel(page: PDFPage, fonts: LabelFonts, box: LabelBox, item: LabelContent) {
  const padX = Math.max(4, box.width * 0.05);
  const nameSize = Math.max(6, Math.min(9, box.height * 0.13));
  const metaSize = Math.max(5, Math.min(7, box.height * 0.09));
  const name = item.name.length > 32 ? `${item.name.slice(0, 31)}…` : item.name;
  const top = box.y + box.height - nameSize - 4;

  page.drawText("SPARKLE & SQUISH", {
    x: box.x + padX,
    y: top,
    size: metaSize,
    font: fonts.bold,
    color: rgb(0.42, 0.32, 0.62),
  });
  page.drawText(name, {
    x: box.x + padX,
    y: top - nameSize - 1,
    size: nameSize,
    font: fonts.bold,
    color: rgb(0.17, 0.15, 0.25),
  });
  const priceWidth = fonts.bold.widthOfTextAtSize(item.price, nameSize);
  page.drawText(item.price, {
    x: box.x + box.width - padX - priceWidth,
    y: top - nameSize - 1,
    size: nameSize,
    font: fonts.bold,
    color: rgb(0.18, 0.43, 0.88),
  });

  const barcodeTop = top - nameSize - 6;
  const barcodeHeight = Math.max(16, box.height * 0.38);
  const barcodeWidth = box.width - padX * 2;
  try {
    const bits = ean13Bits(item.barcode);
    drawBarcode(page, bits, box.x + padX, barcodeTop - barcodeHeight, barcodeWidth, barcodeHeight);
  } catch {
    // A missing or invalid S&S barcode still prints the name, price, and SKU.
  }
  page.drawText(item.barcode, {
    x: box.x + padX,
    y: Math.max(box.y + metaSize + 1, barcodeTop - barcodeHeight - metaSize - 1),
    size: metaSize,
    font: fonts.regular,
    color: rgb(0.17, 0.15, 0.25),
  });
  page.drawText(item.sku, {
    x: box.x + padX,
    y: box.y + 2,
    size: metaSize,
    font: fonts.regular,
    color: rgb(0.45, 0.42, 0.52),
  });
}
