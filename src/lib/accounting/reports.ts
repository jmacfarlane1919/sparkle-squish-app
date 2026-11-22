import type { AccountType } from "@/lib/accounting/chart";

export type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  contra: boolean;
};

export type LedgerMovement = {
  accountId: string;
  entryDate: string;
  debitCents: number;
  creditCents: number;
  memo?: string;
  entryMemo?: string;
};

/** A credit-balance asset (like accumulated depreciation) or a debit-balance income account naturally reduces its group. */
export function signedAmount(type: AccountType, _contra: boolean, debitCents: number, creditCents: number) {
  if (type === "asset" || type === "expense" || type === "cogs") return debitCents - creditCents;
  return creditCents - debitCents;
}

export function inRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

export function priorPeriod(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const days = Math.round((end - start) / 86400000) + 1;
  const priorEnd = new Date(start - 86400000);
  const priorStart = new Date(priorEnd.getTime() - (days - 1) * 86400000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { from: iso(priorStart), to: iso(priorEnd) };
}

export function monthKeys(from: string, to: string) {
  const keys: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  while (`${year}-${String(month).padStart(2, "0")}` <= end) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

function netFor(account: LedgerAccount, lines: LedgerMovement[], from?: string, to?: string) {
  return lines
    .filter((line) => line.accountId === account.id && (!from || !to || inRange(line.entryDate, from, to)))
    .reduce((sum, line) => sum + signedAmount(account.type, account.contra, line.debitCents, line.creditCents), 0);
}

export type ProfitRow = { id: string; code: string; name: string; amountCents: number; months?: number[] };

export function profitAndLoss(input: {
  accounts: LedgerAccount[];
  lines: LedgerMovement[];
  from: string;
  to: string;
  byMonth?: boolean;
  compare?: boolean;
}) {
  const months = input.byMonth ? monthKeys(input.from, input.to) : [];
  const section = (type: AccountType) =>
    input.accounts
      .filter((account) => account.type === type)
      .map((account) => {
        const amountCents = netFor(account, input.lines, input.from, input.to);
        const row: ProfitRow = { id: account.id, code: account.code, name: account.name, amountCents };
        if (months.length) {
          row.months = months.map((key) => {
            const start = `${key}-01`;
            const end = `${key}-31`;
            return netFor(account, input.lines, start < input.from ? input.from : start, end > input.to ? input.to : end);
          });
        }
        return row;
      })
      .filter((row) => row.amountCents !== 0 || row.months?.some((amount) => amount !== 0));
  const income = section("income");
  const cogs = section("cogs");
  const expenses = section("expense");
  const sum = (rows: ProfitRow[]) => rows.reduce((total, row) => total + row.amountCents, 0);
  const incomeCents = sum(income);
  const cogsCents = sum(cogs);
  const expenseCents = sum(expenses);
  const prior = input.compare ? priorPeriod(input.from, input.to) : null;
  const priorNet = prior
    ? ["income", "cogs", "expense"].reduce((total, type, index) => {
        const amount = input.accounts
          .filter((account) => account.type === type)
          .reduce((sumCents, account) => sumCents + netFor(account, input.lines, prior.from, prior.to), 0);
        return total + (index === 0 ? amount : -amount);
      }, 0)
    : null;
  return {
    months,
    income,
    cogs,
    expenses,
    incomeCents,
    cogsCents,
    expenseCents,
    grossCents: incomeCents - cogsCents,
    netCents: incomeCents - cogsCents - expenseCents,
    prior,
    priorNetCents: priorNet,
  };
}

export function balanceSheet(input: { accounts: LedgerAccount[]; lines: LedgerMovement[]; asOf: string }) {
  const through = input.lines.filter((line) => line.entryDate <= input.asOf);
  const rows = (type: AccountType) =>
    input.accounts
      .filter((account) => account.type === type)
      .map((account) => ({
        id: account.id,
        code: account.code,
        name: account.name,
        amountCents: netFor(account, through),
      }))
      .filter((row) => row.amountCents !== 0);
  const assets = rows("asset");
  const liabilities = rows("liability");
  const equity = rows("equity");
  const income = input.accounts.filter((account) => account.type === "income").reduce((sum, account) => sum + netFor(account, through), 0);
  const cogs = input.accounts.filter((account) => account.type === "cogs").reduce((sum, account) => sum + netFor(account, through), 0);
  const expenses = input.accounts.filter((account) => account.type === "expense").reduce((sum, account) => sum + netFor(account, through), 0);
  const earningsCents = income - cogs - expenses;
  const assetCents = assets.reduce((sum, row) => sum + row.amountCents, 0);
  const liabilityCents = liabilities.reduce((sum, row) => sum + row.amountCents, 0);
  const equityCents = equity.reduce((sum, row) => sum + row.amountCents, 0);
  const rightCents = liabilityCents + equityCents + earningsCents;
  return {
    assets,
    liabilities,
    equity,
    assetCents,
    liabilityCents,
    equityCents,
    earningsCents,
    rightCents,
    balanced: assetCents === rightCents,
  };
}

export function trialBalance(input: { accounts: LedgerAccount[]; lines: LedgerMovement[]; asOf: string }) {
  const through = input.lines.filter((line) => line.entryDate <= input.asOf);
  const rows = input.accounts.map((account) => {
    const totals = through
      .filter((line) => line.accountId === account.id)
      .reduce(
        (sum, line) => ({ debitCents: sum.debitCents + line.debitCents, creditCents: sum.creditCents + line.creditCents }),
        { debitCents: 0, creditCents: 0 },
      );
    return { ...account, ...totals };
  }).filter((row) => row.debitCents !== 0 || row.creditCents !== 0);
  const debitCents = rows.reduce((sum, row) => sum + row.debitCents, 0);
  const creditCents = rows.reduce((sum, row) => sum + row.creditCents, 0);
  return { rows, debitCents, creditCents, balanced: debitCents === creditCents };
}
