import { describe, expect, it } from "vitest";
import { STARTER_ACCOUNTS } from "@/lib/accounting/chart";
import {
  billPosting,
  depreciationAmount,
  entryBalances,
  expensePosting,
  paymentPosting,
  periodIsOpen,
  shopifyDayPosting,
} from "@/lib/accounting/post";
import { balanceSheet, profitAndLoss, trialBalance, type LedgerAccount, type LedgerMovement } from "@/lib/accounting/reports";
import { accountBalance, parseStatementCsv, reconciliationDifference } from "@/lib/accounting/reconcile";

const accounts: LedgerAccount[] = [
  { id: "cash", code: "1000", name: "Checking", type: "asset", contra: false },
  { id: "inventory", code: "1200", name: "Inventory", type: "asset", contra: false },
  { id: "equip", code: "1500", name: "Equipment", type: "asset", contra: false },
  { id: "member", code: "2300", name: "Due to/from Jamey", type: "liability", contra: false },
  { id: "sales", code: "4000", name: "Sales", type: "income", contra: false },
  { id: "cogs", code: "5000", name: "Cost of goods sold", type: "cogs", contra: false },
  { id: "supplies", code: "6400", name: "Supplies", type: "expense", contra: false },
];

function move(accountId: string, date: string, debit: number, credit: number): LedgerMovement {
  return { accountId, entryDate: date, debitCents: debit, creditCents: credit };
}

describe("ledger", () => {
  it("only accepts a journal entry whose debits equal credits", () => {
    const posting = expensePosting("cash", [
      { accountId: "supplies", amountCents: 2500, memo: "tape" },
      { accountId: "equip", amountCents: 8000, memo: "shelf", isAsset: true },
    ]);
    expect(entryBalances(posting)).toBe(true);
    expect(posting.find((line) => line.accountId === "equip")?.debitCents).toBe(8000);
    expect(posting.find((line) => line.accountId === "supplies")?.debitCents).toBe(2500);
    expect(posting.find((line) => line.accountId === "cash")?.creditCents).toBe(10500);
    expect(entryBalances([{ accountId: "cash", debitCents: 100, creditCents: 0 }])).toBe(false);
  });

  it("books an asset line to the asset account instead of an expense", () => {
    const assetAccount = "equip";
    const line = { accountId: assetAccount, amountCents: 8000, isAsset: true };
    expect(line.isAsset).toBe(true);
    expect(line.accountId).not.toBe("supplies");
    const posting = expensePosting("member", [line]);
    expect(posting[0]?.accountId).toBe(assetAccount);
    expect(entryBalances(posting)).toBe(true);
  });

  it("posts a bill to bills-to-pay and a later payment to the bank", () => {
    const bill = billPosting("ap", [{ accountId: "inventory", amountCents: 5000 }]);
    const payment = paymentPosting("ap", "cash", 5000);
    expect(entryBalances(bill)).toBe(true);
    expect(entryBalances(payment)).toBe(true);
    expect(bill.find((line) => line.accountId === "ap")?.creditCents).toBe(5000);
    expect(payment.find((line) => line.accountId === "cash")?.creditCents).toBe(5000);
  });

  it("refuses a date on or before the lock", () => {
    expect(periodIsOpen("2026-11-22", "2026-11-21")).toBe(true);
    expect(periodIsOpen("2026-11-21", "2026-11-21")).toBe(false);
    expect(periodIsOpen("2026-11-20", null)).toBe(true);
  });

  it("matches a bank statement when the cleared balance equals the statement", () => {
    const lines = [
      { debitCents: 10000, creditCents: 0 },
      { debitCents: 0, creditCents: 2500 },
    ];
    const cleared = accountBalance("asset", lines);
    expect(cleared).toBe(7500);
    expect(reconciliationDifference(7500, cleared)).toBe(0);
    expect(reconciliationDifference(8000, cleared)).toBe(500);
    expect(accountBalance("liability", [{ debitCents: 0, creditCents: 4000 }])).toBe(4000);
  });

  it("reads a simple bank CSV", () => {
    const rows = parseStatementCsv("Date,Description,Amount\n2026-11-02,Tape,-12.50\n2026-11-03,Deposit,40.00\n");
    expect(rows).toEqual([
      { date: "2026-11-02", description: "Tape", amountCents: -1250 },
      { date: "2026-11-03", description: "Deposit", amountCents: 4000 },
    ]);
  });

  it("lets refunds and depreciation reduce the right totals and still balance", () => {
    const withContra: LedgerAccount[] = [
      ...accounts,
      { id: "refunds", code: "4200", name: "Discounts and refunds", type: "income", contra: true },
      { id: "accum", code: "1510", name: "Accumulated depreciation", type: "asset", contra: true },
      { id: "depr", code: "6700", name: "Depreciation", type: "expense", contra: false },
    ];
    const lines: LedgerMovement[] = [
      move("cash", "2026-11-01", 10000, 0),
      move("sales", "2026-11-01", 0, 10000),
      move("refunds", "2026-11-02", 1500, 0),
      move("cash", "2026-11-02", 0, 1500),
      move("depr", "2026-11-03", 500, 0),
      move("accum", "2026-11-03", 0, 500),
    ];
    const pnl = profitAndLoss({ accounts: withContra, lines, from: "2026-11-01", to: "2026-11-30" });
    expect(pnl.incomeCents).toBe(8500);
    expect(pnl.expenseCents).toBe(500);
    expect(pnl.netCents).toBe(8000);
    const sheet = balanceSheet({ accounts: withContra, lines, asOf: "2026-11-30" });
    expect(sheet.assetCents).toBe(8000);
    expect(sheet.balanced).toBe(true);
  });

  it("builds a profit and loss and a balance sheet that matches", () => {
    const lines: LedgerMovement[] = [
      move("cash", "2026-11-01", 10000, 0),
      move("sales", "2026-11-01", 0, 10000),
      move("cogs", "2026-11-01", 4000, 0),
      move("inventory", "2026-11-01", 0, 4000),
      move("supplies", "2026-11-20", 2500, 0),
      move("cash", "2026-11-20", 0, 2500),
      move("equip", "2026-11-21", 8000, 0),
      move("member", "2026-11-21", 0, 8000),
    ];
    const pnl = profitAndLoss({ accounts, lines, from: "2026-11-01", to: "2026-11-30", compare: true });
    expect(pnl.incomeCents).toBe(10000);
    expect(pnl.cogsCents).toBe(4000);
    expect(pnl.expenseCents).toBe(2500);
    expect(pnl.netCents).toBe(3500);
    const sheet = balanceSheet({ accounts, lines, asOf: "2026-11-30" });
    expect(sheet.assetCents).toBe(10000 - 2500 - 4000 + 8000);
    expect(sheet.liabilityCents).toBe(8000);
    expect(sheet.earningsCents).toBe(3500);
    expect(sheet.balanced).toBe(true);
    const trial = trialBalance({ accounts, lines, asOf: "2026-11-30" });
    expect(trial.balanced).toBe(true);
    expect(trial.debitCents).toBe(trial.creditCents);
  });

  it("posts Shopify sales, refunds, and cost without breaking the books", () => {
    const posting = shopifyDayPosting({
      salesCents: 5000,
      refundCents: 500,
      cogsCents: 2000,
      clearingId: "clearing",
      salesId: "sales",
      refundsId: "refunds",
      cogsId: "cogs",
      inventoryId: "inventory",
    });
    expect(entryBalances(posting)).toBe(true);
  });

  it("keeps depreciation optional and inside the cost", () => {
    expect(depreciationAmount(12000, 0, null, 1)).toBe(0);
    expect(depreciationAmount(12000, 0, 12, 1)).toBe(1000);
    expect(depreciationAmount(12000, 11000, 12, 12)).toBe(1000);
  });

  it("includes a usable starter chart", () => {
    const keys = STARTER_ACCOUNTS.map((account) => account.key);
    expect(keys).toContain("checking");
    expect(keys).toContain("inventory");
    expect(keys).toContain("member");
    expect(keys).toContain("fixed_assets");
    expect(new Set(STARTER_ACCOUNTS.map((account) => account.code)).size).toBe(STARTER_ACCOUNTS.length);
  });
});
