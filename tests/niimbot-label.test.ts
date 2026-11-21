import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { NIIMBOT_COLUMNS, buildNiimbotWorkbook } from "@/lib/labels/niimbot";
import { plainPrice } from "@/lib/labels/template";
import { renderLabels } from "@/lib/labels/render";
import { labelSize } from "@/lib/labels/sizes";

function pdfText(pdf: Uint8Array) {
  const raw = Buffer.from(pdf);
  const parts: string[] = [];
  let index = 0;
  while (index < raw.length) {
    const marker = raw.indexOf("stream", index);
    if (marker < 0) break;
    let dataStart = marker + "stream".length;
    if (raw[dataStart] === 13) dataStart += 1;
    if (raw[dataStart] === 10) dataStart += 1;
    const end = raw.indexOf("endstream", dataStart);
    if (end < 0) break;
    try {
      parts.push(inflateSync(raw.subarray(dataStart, end)).toString("latin1"));
    } catch {
      // Some streams are not deflated content.
    }
    index = end + "endstream".length;
  }
  return parts.join("\n");
}

describe("40x20 mm label", () => {
  it("uses a 40 by 20 mm page and prints the name, plain price, barcode digits, and SKU", async () => {
    const size = labelSize("niimbot-40x20");
    expect(size.width).toBeCloseTo((40 / 25.4) * 72, 2);
    expect(size.height).toBeCloseTo((20 / 25.4) * 72, 2);

    const pdf = await renderLabels(
      [
        {
          name: "Peach Mochi Bear",
          price: "$14.00",
          sku: "SS-SQ-043-STD",
          barcode: "2000000003450",
        },
      ],
      "niimbot-40x20",
    );
    const doc = await PDFDocument.load(pdf);
    const page = doc.getPage(0);
    expect(page.getWidth()).toBeCloseTo(size.width, 2);
    expect(page.getHeight()).toBeCloseTo(size.height, 2);
    const raw = pdfText(pdf);
    const text = [...raw.matchAll(/<([0-9A-Fa-f]+)>/g)].map((match) => Buffer.from(match[1], "hex").toString("latin1")).join("");
    expect(text).toContain("Sparkle & Squish");
    expect(text).toContain("Peach Mochi Bear");
    expect(text).toContain("14.00");
    expect(text).not.toContain("$");
    expect(text).toContain("2000000003450");
    expect(text).toContain("SS-SQ-043-STD");
    expect(raw).toMatch(/ 1 -1 /);
    expect(plainPrice("$12.00")).toBe("12.00");
    expect(plainPrice("08.50")).toBe("08.50");
  });
});

describe("NIIMBOT spreadsheet", () => {
  it("writes the exact columns, keeps price and barcode as text, and uses the label count", async () => {
    const file = await buildNiimbotWorkbook([
      {
        name: "Peach Mochi Bear",
        price: "$14.00",
        sku: "SS-SQ-043-STD",
        barcode: "0200000003457",
        qty: 6,
      },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file);
    const sheet = workbook.getWorksheet("Labels");
    if (!sheet) throw new Error("Missing sheet");
    const headers = [1, 2, 3, 4, 5].map((column) => sheet.getRow(1).getCell(column).value);
    expect(headers).toEqual([...NIIMBOT_COLUMNS]);
    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toBe("Peach Mochi Bear");
    expect(row.getCell(2).value).toBe("14.00");
    expect(row.getCell(2).numFmt).toBe("@");
    expect(row.getCell(3).value).toBe("SS-SQ-043-STD");
    expect(row.getCell(4).value).toBe("0200000003457");
    expect(row.getCell(4).numFmt).toBe("@");
    expect(row.getCell(5).value).toBe(6);
    expect(typeof row.getCell(4).value).toBe("string");
    expect(typeof row.getCell(2).value).toBe("string");
  });
});
