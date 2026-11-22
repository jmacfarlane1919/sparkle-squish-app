export type PostingLine = {
  accountId: string;
  debitCents: number;
  creditCents: number;
  memo?: string;
};

export type BookLine = {
  accountId: string;
  amountCents: number;
  memo?: string;
  isAsset?: boolean;
};

export function entryTotals(lines: PostingLine[]) {
  return {
    debitCents: lines.reduce((sum, line) => sum + line.debitCents, 0),
    creditCents: lines.reduce((sum, line) => sum + line.creditCents, 0),
  };
}

export function entryBalances(lines: PostingLine[]) {
  if (lines.length < 2) return false;
  const totals = entryTotals(lines);
  if (totals.debitCents <= 0 || totals.debitCents !== totals.creditCents) return false;
  return lines.every((line) => {
    if (line.debitCents < 0 || line.creditCents < 0) return false;
    return (line.debitCents > 0) !== (line.creditCents > 0);
  });
}

export function periodIsOpen(entryDate: string, lockedThrough: string | null) {
  if (!lockedThrough) return true;
  return entryDate > lockedThrough;
}

/** Money out: each line is a debit, and the paying account is credited for the total. */
export function expensePosting(paymentAccountId: string, lines: BookLine[]): PostingLine[] {
  const used = lines.filter((line) => line.amountCents > 0);
  const total = used.reduce((sum, line) => sum + line.amountCents, 0);
  return [
    ...used.map((line) => ({
      accountId: line.accountId,
      debitCents: line.amountCents,
      creditCents: 0,
      memo: line.memo,
    })),
    { accountId: paymentAccountId, debitCents: 0, creditCents: total, memo: "Paid" },
  ];
}

/** A supplier bill still owed: debit the lines, credit bills-to-pay. */
export function billPosting(payableAccountId: string, lines: BookLine[]): PostingLine[] {
  const used = lines.filter((line) => line.amountCents > 0);
  const total = used.reduce((sum, line) => sum + line.amountCents, 0);
  return [
    ...used.map((line) => ({
      accountId: line.accountId,
      debitCents: line.amountCents,
      creditCents: 0,
      memo: line.memo,
    })),
    { accountId: payableAccountId, debitCents: 0, creditCents: total, memo: "Bill" },
  ];
}

export function paymentPosting(payableAccountId: string, paymentAccountId: string, amountCents: number): PostingLine[] {
  return [
    { accountId: payableAccountId, debitCents: amountCents, creditCents: 0, memo: "Paid the bill" },
    { accountId: paymentAccountId, debitCents: 0, creditCents: amountCents, memo: "Payment" },
  ];
}

export function shopifyDayPosting(input: {
  salesCents: number;
  refundCents: number;
  cogsCents: number;
  clearingId: string;
  salesId: string;
  refundsId: string;
  cogsId: string;
  inventoryId: string;
}): PostingLine[] {
  const lines: PostingLine[] = [];
  if (input.salesCents > 0) {
    lines.push({ accountId: input.clearingId, debitCents: input.salesCents, creditCents: 0, memo: "Shopify sales" });
    lines.push({ accountId: input.salesId, debitCents: 0, creditCents: input.salesCents, memo: "Shopify sales" });
  }
  if (input.refundCents > 0) {
    lines.push({ accountId: input.refundsId, debitCents: input.refundCents, creditCents: 0, memo: "Shopify refunds" });
    lines.push({ accountId: input.clearingId, debitCents: 0, creditCents: input.refundCents, memo: "Shopify refunds" });
  }
  if (input.cogsCents > 0) {
    lines.push({ accountId: input.cogsId, debitCents: input.cogsCents, creditCents: 0, memo: "Cost of goods sold" });
    lines.push({ accountId: input.inventoryId, debitCents: 0, creditCents: input.cogsCents, memo: "Inventory sold" });
  }
  return lines;
}

export function straightLineCents(costCents: number, usefulLifeMonths: number, months: number) {
  if (usefulLifeMonths <= 0 || months <= 0 || costCents <= 0) return 0;
  return Math.round((costCents / usefulLifeMonths) * months);
}

export function depreciationAmount(costCents: number, alreadyCents: number, usefulLifeMonths: number | null, months: number) {
  if (!usefulLifeMonths) return 0;
  const next = straightLineCents(costCents, usefulLifeMonths, months);
  return Math.max(0, Math.min(next, costCents - alreadyCents));
}
