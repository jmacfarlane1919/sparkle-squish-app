import { PDFDocument, StandardFonts } from "pdf-lib";
import { getSession } from "@/lib/auth";
import { balanceSheet, profitAndLoss, trialBalance } from "@/lib/accounting/reports";
import { prisma } from "@/lib/db";
import { ledgerMovements } from "@/server/ledger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Sign in required.", { status: 401 });
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "pl";
  const from = url.searchParams.get("from") || "2026-01-01";
  const to = url.searchParams.get("to") || "2026-12-31";
  const pdf = url.searchParams.get("format") === "pdf";
  const lines = await textLines(kind, from, to, url.searchParams.get("account") || "");
  if (pdf) {
    const bytes = await toPdf(lines[0] || "Report", lines.slice(1));
    return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${kind}.pdf"` } });
  }
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}.csv"` } });
}

async function textLines(kind: string, from: string, to: string, accountId: string) {
  if (kind === "expenses") {
    const rows = await prisma.expense.findMany({ include: { paymentAccount: true, lines: { include: { account: true } } }, orderBy: { expenseDate: "asc" } });
    const fields = await prisma.customField.findMany({ where: { entity: "expense" }, include: { values: true } });
    const header = ["Date", "Vendor", "Total", "Paid from", "Lines", ...fields.map((field) => field.label)];
    return [header.join(","), ...rows.map((row) => {
      const extras = fields.map((field) => csv(field.values.find((value) => value.recordId === row.id)?.value || ""));
      return [row.expenseDate.toISOString().slice(0, 10), csv(row.vendorName), (row.totalCents / 100).toFixed(2), csv(row.paymentAccount.name), csv(row.lines.map((line) => line.account.name).join("; ")), ...extras].join(",");
    })];
  }
  if (kind === "assets") {
    const rows = await prisma.asset.findMany({ include: { account: true }, orderBy: { purchaseDate: "asc" } });
    return ["Name,Date,Cost,Account,Where,Depreciation on", ...rows.map((row) => [csv(row.name), row.purchaseDate.toISOString().slice(0, 10), (row.costCents / 100).toFixed(2), csv(row.account.name), csv(row.whereName), row.depreciate ? "yes" : "no"].join(","))];
  }
  const { accounts, lines } = await ledgerMovements();
  if (kind === "bs") {
    const report = balanceSheet({ accounts, lines, asOf: to });
    return ["Section,Code,Name,Amount", ...report.assets.map((row) => `Own,${row.code},${csv(row.name)},${(row.amountCents / 100).toFixed(2)}`), ...report.liabilities.map((row) => `Owe,${row.code},${csv(row.name)},${(row.amountCents / 100).toFixed(2)}`), ...report.equity.map((row) => `Stake,${row.code},${csv(row.name)},${(row.amountCents / 100).toFixed(2)}`), `Profit,,,${(report.earningsCents / 100).toFixed(2)}`, `Balances,${report.balanced}`];
  }
  if (kind === "tb") {
    const report = trialBalance({ accounts, lines, asOf: to });
    return ["Code,Name,Debit,Credit", ...report.rows.map((row) => `${row.code},${csv(row.name)},${(row.debitCents / 100).toFixed(2)},${(row.creditCents / 100).toFixed(2)}`)];
  }
  if (kind === "gl") {
    const account = accounts.find((row) => row.id === accountId);
    const rows = lines.filter((line) => line.accountId === accountId && line.entryDate >= from && line.entryDate <= to);
    return [`${account?.code || ""} ${account?.name || ""}`, "Date,Memo,Debit,Credit", ...rows.map((line) => `${line.entryDate},${csv(line.entryMemo || "")},${(line.debitCents / 100).toFixed(2)},${(line.creditCents / 100).toFixed(2)}`)];
  }
  const report = profitAndLoss({ accounts, lines, from, to, compare: true });
  return ["Section,Code,Name,Amount", ...report.income.map((row) => `In,${row.code},${csv(row.name)},${(row.amountCents / 100).toFixed(2)}`), ...report.cogs.map((row) => `Product cost,${row.code},${csv(row.name)},${(row.amountCents / 100).toFixed(2)}`), ...report.expenses.map((row) => `Cost,${row.code},${csv(row.name)},${(row.amountCents / 100).toFixed(2)}`), `Profit,,,${(report.netCents / 100).toFixed(2)}`];
}

function csv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function toPdf(title: string, rows: string[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([612, 792]);
  let y = 740;
  page.drawText(title.slice(0, 90), { x: 48, y, size: 16, font });
  y -= 28;
  for (const row of rows) {
    if (y < 48) {
      page = pdf.addPage([612, 792]);
      y = 740;
    }
    page.drawText(row.replace(/"/g, "").slice(0, 100), { x: 48, y, size: 10, font });
    y -= 14;
  }
  return pdf.save();
}
