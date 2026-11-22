"use server";

import { revalidatePath } from "next/cache";
import { accountBalance, parseStatementCsv, reconciliationDifference } from "@/lib/accounting/reconcile";
import { parseUsdToCents } from "@/lib/invoices/match";
import { prisma } from "@/lib/db";
import { accountMap, createExpense, markInvoicePaid, postDepreciation, postInvoiceBooks, postManual, postShopifyToBooks, saveCustomValues, setBooksLockedThrough, stampToDate } from "@/server/ledger";
import { go } from "@/server/nav";
import type { PostingLine } from "@/lib/accounting/post";

function text(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}

function files(form: FormData) {
  return form.getAll("files").filter((item): item is File => item instanceof File);
}

function moneyLines(form: FormData) {
  const parsed = JSON.parse(text(form, "lines") || "[]") as { accountId?: string; amount?: string; memo?: string; isAsset?: boolean }[];
  return parsed.map((line) => ({
    accountId: String(line.accountId || ""),
    amountCents: parseUsdToCents(String(line.amount || "")) || 0,
    memo: String(line.memo || ""),
    isAsset: Boolean(line.isAsset),
  }));
}

export async function saveExpense(form: FormData) {
  try {
    const expense = await createExpense({
      date: text(form, "date"),
      vendorName: text(form, "vendor"),
      supplierId: text(form, "supplierId") || null,
      paymentAccountId: text(form, "paymentAccountId"),
      whereName: text(form, "whereName"),
      whereUrl: text(form, "whereUrl"),
      whereAddress: text(form, "whereAddress"),
      memo: text(form, "memo"),
      lines: moneyLines(form),
      files: files(form),
    });
    await saveCustomValues("expense", expense.id, form);
    revalidatePath("/accounting");
    go(`/accounting/expenses/${expense.id}`, { notice: "Saved in the books." });
  } catch (error) {
    go("/accounting/expenses/new", { error: error instanceof Error ? error.message : "Could not save that expense." });
  }
}

export async function saveInvoiceBooks(form: FormData) {
  const id = text(form, "invoiceId");
  try {
    const { byKey } = await accountMap();
    const payable = byKey.get("ap");
    if (!payable) throw new Error("The supplier bills account is missing.");
    await postInvoiceBooks({
      invoiceId: id,
      date: text(form, "date"),
      payableAccountId: payable.id,
      paymentAccountId: text(form, "paymentAccountId") || null,
      whereName: text(form, "whereName"),
      whereUrl: text(form, "whereUrl"),
      whereAddress: text(form, "whereAddress"),
      lines: moneyLines(form),
      files: files(form),
      paid: text(form, "paid") === "yes",
    });
    await saveCustomValues("invoice", id, form);
    revalidatePath(`/invoices/${id}`);
    go(`/invoices/${id}`, { notice: "The bill is in the books." });
  } catch (error) {
    go(`/invoices/${id}`, { error: error instanceof Error ? error.message : "Could not enter that bill." });
  }
}

export async function payInvoice(form: FormData) {
  const id = text(form, "invoiceId");
  try {
    await markInvoicePaid(id, text(form, "paymentAccountId"), text(form, "date"));
    go(`/invoices/${id}`, { notice: "Marked paid." });
  } catch (error) {
    go(`/invoices/${id}`, { error: error instanceof Error ? error.message : "Could not mark it paid." });
  }
}

export async function saveAccount(form: FormData) {
  const id = text(form, "id");
  const code = text(form, "code");
  const name = text(form, "name");
  const type = text(form, "type");
  if (!code || !name || !type) go("/accounting/accounts", { error: "A category needs a number, a name, and a type." });
  const data = {
    code,
    name,
    type,
    contra: text(form, "contra") === "yes",
    active: text(form, "active") !== "no",
    parentId: text(form, "parentId") || null,
  };
  if (id) await prisma.account.update({ where: { id }, data });
  else await prisma.account.create({ data });
  revalidatePath("/accounting/accounts");
  go("/accounting/accounts", { notice: "Saved." });
}

export async function deactivateAccount(form: FormData) {
  const id = text(form, "id");
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) go("/accounting/accounts", { error: "That category is gone." });
  await prisma.account.update({ where: { id }, data: { active: !account.active } });
  go("/accounting/accounts", { notice: account.active ? "Hidden. Past activity stays in the books." : "Shown again." });
}

export async function saveManual(form: FormData) {
  try {
    const lines: PostingLine[] = [];
    for (let index = 0; index < 8; index += 1) {
      const accountId = text(form, `account-${index}`);
      const debit = parseUsdToCents(text(form, `debit-${index}`)) || 0;
      const credit = parseUsdToCents(text(form, `credit-${index}`)) || 0;
      if (!accountId || (debit === 0 && credit === 0)) continue;
      lines.push({ accountId, debitCents: debit, creditCents: credit });
    }
    await postManual({ date: text(form, "date"), memo: text(form, "memo"), lines });
    go("/accounting/journal", { notice: "Adjustment saved." });
  } catch (error) {
    go("/accounting/journal", { error: error instanceof Error ? error.message : "Could not save that adjustment." });
  }
}

export async function saveLock(form: FormData) {
  await setBooksLockedThrough(text(form, "lock"));
  go("/accounting", { notice: text(form, "lock") ? `Books are locked through ${text(form, "lock")}.` : "The lock is off." });
}

export async function postShopifyAction() {
  try {
    const count = await postShopifyToBooks();
    go("/accounting", { notice: count ? `Posted ${count} days of Shopify sales.` : "Shopify sales were already in the books." });
  } catch (error) {
    go("/accounting", { error: error instanceof Error ? error.message : "Could not post Shopify sales." });
  }
}

export async function saveField(form: FormData) {
  const entity = text(form, "entity");
  const label = text(form, "label");
  const fieldType = text(form, "fieldType");
  if (!entity || !label || !fieldType) go("/accounting/fields", { error: "Pick where the field goes, and give it a name." });
  await prisma.customField.create({
    data: { entity, label, fieldType, options: text(form, "options") },
  });
  go("/accounting/fields", { notice: "Field added." });
}

export async function hideField(form: FormData) {
  const id = text(form, "id");
  const field = await prisma.customField.findUnique({ where: { id } });
  if (field) await prisma.customField.update({ where: { id }, data: { hidden: !field.hidden } });
  go("/accounting/fields", { notice: "Updated. Hidden fields keep their answers." });
}

export async function saveSupplierFields(form: FormData) {
  const id = text(form, "supplierId");
  await saveCustomValues("supplier", id, form);
  go(`/suppliers/${id}`, { notice: "Extra details saved." });
}

export async function startReconciliation(form: FormData) {
  const accountId = text(form, "accountId");
  const ending = parseUsdToCents(text(form, "ending"));
  const date = text(form, "date");
  if (!accountId || ending == null || !date) go("/accounting/reconcile", { error: "Pick the account, the statement date, and the ending balance." });
  const row = await prisma.reconciliation.create({
    data: { accountId, statementDate: stampToDate(date), endingBalanceCents: ending },
  });
  go(`/accounting/reconcile/${row.id}`);
}

export async function saveReconciliation(form: FormData) {
  const id = text(form, "id");
  const picked = form.getAll("cleared").map(String);
  await prisma.reconciliationMark.deleteMany({ where: { reconciliationId: id } });
  if (picked.length) {
    await prisma.reconciliationMark.createMany({ data: picked.map((journalLineId) => ({ reconciliationId: id, journalLineId })) });
  }
  const rec = await prisma.reconciliation.findUnique({ where: { id }, include: { account: true, marks: true } });
  if (!rec) go("/accounting/reconcile", { error: "That reconciliation is gone." });
  const lines = await prisma.journalLine.findMany({
    where: { id: { in: rec.marks.map((mark) => mark.journalLineId) } },
  });
  const cleared = accountBalance(rec.account.type === "liability" ? "liability" : "asset", lines);
  const difference = reconciliationDifference(rec.endingBalanceCents, cleared);
  if (text(form, "finish") === "yes") {
    if (difference !== 0) go(`/accounting/reconcile/${id}`, { error: `Still off by $${(difference / 100).toFixed(2)}. Tick lines until the difference is zero.` });
    await prisma.reconciliation.update({ where: { id }, data: { finishedAt: new Date() } });
    go("/accounting/reconcile", { notice: "Reconciliation finished." });
  }
  go(`/accounting/reconcile/${id}`, { notice: difference === 0 ? "Difference is $0. You can finish." : `Difference is $${(difference / 100).toFixed(2)}.` });
}

export async function importStatement(form: FormData) {
  const id = text(form, "id");
  const file = form.get("csv");
  const textBody = file instanceof File ? await file.text() : text(form, "csv");
  const rows = parseStatementCsv(textBody);
  if (!rows.length) go(`/accounting/reconcile/${id}`, { error: "No dated amounts were found. Use columns Date, Description, and Amount." });
  await prisma.statementLine.createMany({
    data: rows.map((row) => ({ reconciliationId: id, lineDate: stampToDate(row.date), description: row.description, amountCents: row.amountCents })),
  });
  go(`/accounting/reconcile/${id}`, { notice: `Added ${rows.length} statement lines.` });
}

export async function statementToExpense(form: FormData) {
  const lineId = text(form, "lineId");
  const line = await prisma.statementLine.findUnique({ where: { id: lineId }, include: { reconciliation: true } });
  if (!line || line.amountCents >= 0) go("/accounting/reconcile", { error: "Only money that left the account can become an expense." });
  const { byKey } = await accountMap();
  const supplies = byKey.get("supplies");
  if (!supplies) go("/accounting/reconcile", { error: "The supplies account is missing." });
  try {
    const expense = await createExpense({
      date: line.lineDate.toISOString().slice(0, 10),
      vendorName: line.description || "Bank charge",
      supplierId: null,
      paymentAccountId: line.reconciliation.accountId,
      whereName: "",
      whereUrl: "",
      whereAddress: "",
      memo: "From the bank statement",
      lines: [{ accountId: supplies.id, amountCents: Math.abs(line.amountCents), memo: line.description }],
      files: [],
    });
    const journal = await prisma.journalLine.findFirst({ where: { entry: { sourceKey: `expense:${expense.id}` }, accountId: line.reconciliation.accountId } });
    if (journal) {
      await prisma.statementLine.update({ where: { id: line.id }, data: { journalLineId: journal.id } });
      await prisma.reconciliationMark.create({ data: { reconciliationId: line.reconciliationId, journalLineId: journal.id } });
    }
    go(`/accounting/expenses/${expense.id}`, { notice: "Expense created from the statement. Change the category if supplies is wrong." });
  } catch (error) {
    go(`/accounting/reconcile/${line.reconciliationId}`, { error: error instanceof Error ? error.message : "Could not create the expense." });
  }
}

export async function postAssetDepreciation(form: FormData) {
  const id = text(form, "assetId");
  try {
    await postDepreciation(id, Number(text(form, "months")) || 1, text(form, "date"));
    go(`/accounting/assets/${id}`, { notice: "Depreciation posted." });
  } catch (error) {
    go(`/accounting/assets/${id}`, { error: error instanceof Error ? error.message : "Could not post depreciation." });
  }
}

export async function setAssetLife(form: FormData) {
  const id = text(form, "assetId");
  const months = Number(text(form, "months"));
  await prisma.asset.update({
    where: { id },
    data: { usefulLifeMonths: Number.isFinite(months) && months > 0 ? months : null, depreciate: text(form, "depreciate") === "yes" },
  });
  go(`/accounting/assets/${id}`, { notice: "Saved. Depreciation stays off until you turn it on." });
}
