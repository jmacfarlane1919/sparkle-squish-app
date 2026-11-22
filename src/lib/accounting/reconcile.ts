import { rowsToRecords } from "@/lib/csv";
import { parseInvoiceDate, parseUsdToCents } from "@/lib/invoices/match";

export type ClearableLine = {
  id: string;
  entryDate: string;
  debitCents: number;
  creditCents: number;
};

/** Bank and cash balances grow with deposits. A credit card balance grows when you spend. */
export function accountBalance(type: "asset" | "liability", lines: Pick<ClearableLine, "debitCents" | "creditCents">[]) {
  const debit = lines.reduce((sum, line) => sum + line.debitCents, 0);
  const credit = lines.reduce((sum, line) => sum + line.creditCents, 0);
  return type === "asset" ? debit - credit : credit - debit;
}

export function reconciliationDifference(statementEndingCents: number, clearedBalanceCents: number) {
  return statementEndingCents - clearedBalanceCents;
}

export function parseStatementCsv(text: string) {
  return rowsToRecords(text).flatMap(({ record }) => {
    const date = parseInvoiceDate(record.date || record.posted_date || record.transaction_date || "");
    const description = record.description || record.memo || record.name || record.details || "Bank line";
    let amount = parseUsdToCents(record.amount || "");
    if (amount == null && (record.debit || record.credit)) {
      const debit = parseUsdToCents(record.debit || "0") || 0;
      const credit = parseUsdToCents(record.credit || "0") || 0;
      amount = credit - debit;
    }
    if (!date || amount == null || amount === 0) return [];
    return [{ date, description, amountCents: amount }];
  });
}
