import { degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ean13Bits } from "@/lib/ean13-bars";

/**
 * Label template.
 *
 * This is the only module that decides how a sticker looks.
 * The default stock is NIIMBOT EW40*20: 40 × 20 mm, white.
 * Other paper sizes use this same layout, scaled to their box.
 *
 * Fields: product name, price, S&S SKU (custom.s_s_sku), S&S barcode (custom.s_s_barcode).
 */
export const LABEL_TEMPLATE_ID = "ss-niimbot-40x20";

export const NIIMBOT_WIDTH_MM = 40;
export const NIIMBOT_HEIGHT_MM = 20;

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

const ink = rgb(0.1, 0.08, 0.14);

export function plainPrice(price: string) {
  const cleaned = price.replace(/[^0-9.]/g, "");
  const match = cleaned.match(/^(\d*)(?:\.(\d{0,2})\d*)?$/);
  if (!match || cleaned === "") return price.trim();
  const dollars = match[1] === "" ? "0" : match[1];
  const cents = (match[2] || "").padEnd(2, "0");
  return `${dollars}.${cents}`;
}

function fitLine(text: string, font: PDFFont, maxWidth: number, maxSize: number, minSize: number) {
  let size = maxSize;
  let shown = text.trim();
  while (size > minSize && font.widthOfTextAtSize(shown, size) > maxWidth) size -= 0.2;
  if (font.widthOfTextAtSize(shown, size) > maxWidth) {
    while (shown.length > 1 && font.widthOfTextAtSize(`${shown.slice(0, -1)}…`, size) > maxWidth) {
      shown = shown.slice(0, -1);
    }
    shown = shown.length > 1 ? `${shown.slice(0, -1)}…` : shown;
  }
  return { shown, size };
}

function drawBarcode(page: PDFPage, bits: string, x: number, y: number, width: number, height: number) {
  const moduleWidth = width / bits.length;
  let cursor = x;
  for (const bit of bits) {
    if (bit === "1") {
      page.drawRectangle({ x: cursor, y, width: moduleWidth + 0.15, height, color: ink });
    }
    cursor += moduleWidth;
  }
}

export function drawProductLabel(page: PDFPage, fonts: LabelFonts, box: LabelBox, item: LabelContent) {
  const brand = "Sparkle & Squish";
  let brandSize = Math.min(5.4, box.height * 0.095);
  while (brandSize > 3 && fonts.bold.widthOfTextAtSize(brand, brandSize) > box.height - 4) brandSize -= 0.1;
  const brandLength = fonts.bold.widthOfTextAtSize(brand, brandSize);
  const brandX = box.x + brandSize * 0.82;
  page.drawText(brand, {
    x: brandX,
    y: box.y + (box.height - brandLength) / 2,
    size: brandSize,
    font: fonts.bold,
    color: ink,
    rotate: degrees(90),
  });

  const ruleX = brandX + Math.max(1.6, box.width * 0.012);
  page.drawLine({
    start: { x: ruleX, y: box.y + 1.5 },
    end: { x: ruleX, y: box.y + box.height - 1.5 },
    thickness: Math.max(0.35, box.width * 0.004),
    color: ink,
  });

  const contentX = ruleX + Math.max(2, box.width * 0.02);
  const contentWidth = box.x + box.width - contentX - Math.max(1.5, box.width * 0.02);
  const priceText = plainPrice(item.price);
  const nameFit = fitLine(item.name, fonts.bold, contentWidth, Math.min(6.2, box.height * 0.12), 3.2);
  const priceSize = Math.min(box.height * 0.24, 13);
  const skuSize = Math.max(2.4, Math.min(3.4, box.height * 0.055));
  const digitSize = Math.max(3, Math.min(4.6, box.height * 0.078));
  let cursor = box.y + box.height - 1.4;

  const nameWidth = fonts.bold.widthOfTextAtSize(nameFit.shown, nameFit.size);
  cursor -= nameFit.size;
  page.drawText(nameFit.shown, {
    x: contentX + (contentWidth - nameWidth) / 2,
    y: cursor,
    size: nameFit.size,
    font: fonts.bold,
    color: ink,
  });

  cursor -= priceSize + 0.8;
  const priceWidth = fonts.bold.widthOfTextAtSize(priceText, priceSize);
  page.drawText(priceText, {
    x: contentX + (contentWidth - priceWidth) / 2,
    y: cursor,
    size: priceSize,
    font: fonts.bold,
    color: ink,
  });

  const sku = item.sku.trim();
  if (sku) {
    const skuFit = fitLine(sku, fonts.regular, contentWidth, skuSize, 2.2);
    cursor -= skuFit.size + 0.4;
    const skuWidth = fonts.regular.widthOfTextAtSize(skuFit.shown, skuFit.size);
    page.drawText(skuFit.shown, {
      x: contentX + (contentWidth - skuWidth) / 2,
      y: cursor,
      size: skuFit.size,
      font: fonts.regular,
      color: rgb(0.28, 0.25, 0.33),
    });
  }

  const digitY = box.y + 1;
  const barcodeY = digitY + digitSize + 0.7;
  const barcodeTop = cursor - 1.1;
  const barcodeHeight = barcodeTop - barcodeY;
  const barcodeWidth = contentWidth * 0.98;
  const barcodeX = contentX + (contentWidth - barcodeWidth) / 2;
  if (item.barcode && barcodeHeight > 8) {
    try {
      const bits = ean13Bits(item.barcode);
      const quiet = barcodeWidth * 0.05;
      drawBarcode(page, bits, barcodeX + quiet, barcodeY, barcodeWidth - quiet * 2, barcodeHeight);
      const digits = item.barcode.split("");
      digits.forEach((digit, index) => {
        const width = fonts.regular.widthOfTextAtSize(digit, digitSize);
        const x = barcodeX + ((barcodeWidth * (index + 0.5)) / digits.length) - width / 2;
        page.drawText(digit, { x, y: digitY, size: digitSize, font: fonts.regular, color: ink });
      });
    } catch {
      page.drawText(item.barcode, { x: contentX, y: digitY, size: digitSize, font: fonts.regular, color: ink });
    }
  }
}
