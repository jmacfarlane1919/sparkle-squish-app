import ExcelJS from "exceljs";
import { plainPrice } from "@/lib/labels/template";

export const NIIMBOT_COLUMNS = ["Inventory Name", "Price (USD)", "SKU", "Barcode", "Available Quantity"] as const;

export type NiimbotRow = {
  name: string;
  price: string;
  sku: string;
  barcode: string;
  qty: number;
};

function asText(value: string) {
  return value;
}

export async function buildNiimbotWorkbook(rows: NiimbotRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "S&S Software";
  const sheet = workbook.addWorksheet("Labels");
  sheet.columns = [
    { header: "Inventory Name", width: 32 },
    { header: "Price (USD)", width: 14 },
    { header: "SKU", width: 20 },
    { header: "Barcode", width: 18 },
    { header: "Available Quantity", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    const added = sheet.addRow([row.name, plainPrice(row.price), row.sku, row.barcode, row.qty]);
    const price = added.getCell(2);
    const barcode = added.getCell(4);
    price.value = asText(plainPrice(row.price));
    price.numFmt = "@";
    barcode.value = asText(row.barcode);
    barcode.numFmt = "@";
    added.getCell(3).value = row.sku;
    added.getCell(3).numFmt = "@";
    added.getCell(5).value = row.qty;
  }
  return workbook.xlsx.writeBuffer();
}
