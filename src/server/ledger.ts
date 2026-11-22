import { randomUUID } from "node:crypto";
import { STARTER_ACCOUNTS } from "@/lib/accounting/chart";
import {
  billPosting,
  depreciationAmount,
  entryBalances,
  expensePosting,
  paymentPosting,
  periodIsOpen,
  shopifyDayPosting,
  type BookLine,
  type PostingLine,
} from "@/lib/accounting/post";
import type { LedgerAccount, LedgerMovement } from "@/lib/accounting/reports";
import { prisma } from "@/lib/db";
import { chicagoDateKey } from "@/lib/format";
import { canStoreFiles, saveBytes, STORAGE_NOT_READY } from "@/lib/storage";
import { contentTypeFor } from "@/lib/invoices/match";

const LOCK_KEY = "books_locked_through";

export function dayStamp(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function stampToDate(stamp: string) {
  return new Date(`${stamp}T12:00:00.000Z`);
}

export async function booksLockedThrough() {
  const row = await prisma.appSetting.findUnique({ where: { key: LOCK_KEY } });
  return row?.value || "";
}

export async function setBooksLockedThrough(stamp: string) {
  if (!stamp) {
    await prisma.appSetting.deleteMany({ where: { key: LOCK_KEY } });
    return;
  }
  await prisma.appSetting.upsert({
    where: { key: LOCK_KEY },
    update: { value: stamp },
    create: { key: LOCK_KEY, value: stamp },
  });
}

export async function ensureChart() {
  const existing = await prisma.account.findMany({ select: { systemKey: true, code: true } });
  const keys = new Set(existing.map((row) => row.systemKey).filter(Boolean));
  const codes = new Set(existing.map((row) => row.code));
  const missing = STARTER_ACCOUNTS.filter((account) => !keys.has(account.key) && !codes.has(account.code));
  if (!missing.length) return;
  await prisma.account.createMany({
    data: missing.map((account) => ({
      code: account.code,
      name: account.name,
      type: account.type,
      contra: Boolean(account.contra),
      systemKey: account.key,
    })),
  });
}

export async function accountMap() {
  await ensureChart();
  const rows = await prisma.account.findMany({ orderBy: { code: "asc" } });
  const byKey = new Map(rows.filter((row) => row.systemKey).map((row) => [row.systemKey as string, row]));
  return { rows, byKey };
}

export async function requireOpen(stamp: string) {
  const lock = await booksLockedThrough();
  if (!periodIsOpen(stamp, lock || null)) {
    throw new Error(`The books are locked through ${lock}. Use a later date, or change the lock on the Books page.`);
  }
}

export async function postJournal(input: { date: string; memo: string; source: string; sourceKey: string; lines: PostingLine[] }) {
  await requireOpen(input.date);
  if (!entryBalances(input.lines)) throw new Error("That entry does not balance. Money in and money out have to match.");
  const existing = await prisma.journalEntry.findUnique({ where: { sourceKey: input.sourceKey } });
  if (existing) return existing;
  return prisma.journalEntry.create({
    data: {
      entryDate: stampToDate(input.date),
      memo: input.memo,
      source: input.source,
      sourceKey: input.sourceKey,
      lines: {
        create: input.lines.map((line) => ({
          accountId: line.accountId,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
          memo: line.memo || "",
        })),
      },
    },
  });
}

export type MoneyLine = BookLine & { isAsset?: boolean; name?: string };

async function rememberAsset(input: {
  name: string;
  date: string;
  amountCents: number;
  accountId: string;
  expenseLineId?: string;
  invoiceLineId?: string;
  whereName: string;
  whereUrl: string;
  whereAddress: string;
}) {
  return prisma.asset.create({
    data: {
      name: input.name,
      purchaseDate: stampToDate(input.date),
      costCents: input.amountCents,
      accountId: input.accountId,
      expenseLineId: input.expenseLineId,
      invoiceLineId: input.invoiceLineId,
      whereName: input.whereName,
      whereUrl: input.whereUrl,
      whereAddress: input.whereAddress,
      depreciate: false,
    },
  });
}

export async function saveUploadedFiles(kind: "expense" | "asset", parent: { expenseId?: string; assetId?: string }, files: File[]) {
  const real = files.filter((file) => file.size > 0);
  if (!real.length) return;
  if (!canStoreFiles()) throw new Error(STORAGE_NOT_READY);
  for (const file of real) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const id = randomUUID();
    const storageKey = `books/${kind}/${id}-${file.name.replace(/[^\w.\- ()]+/g, "_")}`;
    await saveBytes(storageKey, bytes, contentTypeFor(file.name));
    await prisma.accountingFile.create({
      data: {
        kind,
        expenseId: parent.expenseId,
        assetId: parent.assetId,
        filename: file.name,
        storageKey,
        contentType: contentTypeFor(file.name),
      },
    });
  }
}

export async function createExpense(input: {
  date: string;
  vendorName: string;
  supplierId: string | null;
  paymentAccountId: string;
  whereName: string;
  whereUrl: string;
  whereAddress: string;
  memo: string;
  lines: MoneyLine[];
  files: File[];
}) {
  const lines = input.lines.filter((line) => line.amountCents > 0 && line.accountId);
  if (!input.vendorName) throw new Error("Who did you pay?");
  if (!lines.length) throw new Error("Add at least one amount.");
  await requireOpen(input.date);
  if (input.files.some((file) => file.size > 0) && !canStoreFiles()) throw new Error(STORAGE_NOT_READY);
  const posting = expensePosting(input.paymentAccountId, lines);
  const total = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const expense = await prisma.expense.create({
    data: {
      expenseDate: stampToDate(input.date),
      vendorName: input.vendorName,
      supplierId: input.supplierId,
      paymentAccountId: input.paymentAccountId,
      whereName: input.whereName,
      whereUrl: input.whereUrl,
      whereAddress: input.whereAddress,
      memo: input.memo,
      totalCents: total,
      lines: {
        create: lines.map((line) => ({
          accountId: line.accountId,
          amountCents: line.amountCents,
          memo: line.memo || "",
          isAsset: Boolean(line.isAsset),
        })),
      },
    },
    include: { lines: true },
  });
  const entry = await postJournal({
    date: input.date,
    memo: input.memo || input.vendorName,
    source: "expense",
    sourceKey: `expense:${expense.id}`,
    lines: posting,
  });
  await prisma.expense.update({ where: { id: expense.id }, data: { journalEntryId: entry.id } });
  for (const line of expense.lines) {
    if (!line.isAsset) continue;
    await rememberAsset({
      name: line.memo || input.vendorName,
      date: input.date,
      amountCents: line.amountCents,
      accountId: line.accountId,
      expenseLineId: line.id,
      whereName: input.whereName,
      whereUrl: input.whereUrl,
      whereAddress: input.whereAddress,
    });
  }
  await saveUploadedFiles("expense", { expenseId: expense.id }, input.files);
  return expense;
}

export async function postInvoiceBooks(input: {
  invoiceId: string;
  date: string;
  payableAccountId: string;
  paymentAccountId: string | null;
  whereName: string;
  whereUrl: string;
  whereAddress: string;
  lines: MoneyLine[];
  files: File[];
  paid: boolean;
}) {
  const invoice = await prisma.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!invoice) throw new Error("That invoice is gone.");
  if (input.files.some((file) => file.size > 0) && !canStoreFiles()) throw new Error(STORAGE_NOT_READY);
  const lines = input.lines.filter((line) => line.amountCents > 0 && line.accountId);
  if (!lines.length) throw new Error("Add at least one line so the bill can go into the books.");
  await requireOpen(input.date);
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      whereName: input.whereName,
      whereUrl: input.whereUrl,
      whereAddress: input.whereAddress,
      paymentAccountId: input.paymentAccountId,
      lines: {
        deleteMany: {},
        create: lines.map((line) => ({
          accountId: line.accountId,
          amountCents: line.amountCents,
          memo: line.memo || "",
          isAsset: Boolean(line.isAsset),
        })),
      },
    },
  });
  const savedLines = await prisma.invoiceLine.findMany({ where: { invoiceId: invoice.id } });
  if (!invoice.billEntryId) {
    const bill = await postJournal({
      date: input.date,
      memo: `${invoice.vendorName} ${invoice.invoiceNumber}`,
      source: "invoice",
      sourceKey: `invoice:${invoice.id}`,
      lines: billPosting(input.payableAccountId, lines),
    });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { billEntryId: bill.id, totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0) } });
  }
  for (const line of savedLines) {
    if (!line.isAsset) continue;
    const existing = await prisma.asset.findUnique({ where: { invoiceLineId: line.id } });
    if (existing) continue;
    await rememberAsset({
      name: line.memo || invoice.vendorName,
      date: input.date,
      amountCents: line.amountCents,
      accountId: line.accountId,
      invoiceLineId: line.id,
      whereName: input.whereName,
      whereUrl: input.whereUrl,
      whereAddress: input.whereAddress,
    });
  }
  if (input.paid && input.paymentAccountId) {
    await payInvoice(invoice.id, input.paymentAccountId, input.date, lines.reduce((sum, line) => sum + line.amountCents, 0), input.payableAccountId);
  }
  if (input.files.some((file) => file.size > 0)) {
    for (const file of input.files) {
      if (!file.size) continue;
      const bytes = Buffer.from(await file.arrayBuffer());
      const storageKey = `invoices/${invoice.id}/${randomUUID()}-${file.name.replace(/[^\w.\- ()]+/g, "_")}`;
      await saveBytes(storageKey, bytes, contentTypeFor(file.name));
      await prisma.invoiceAttachment.create({
        data: { invoiceId: invoice.id, filename: file.name, storageKey, contentType: contentTypeFor(file.name) },
      });
    }
  }
}

async function payInvoice(invoiceId: string, paymentAccountId: string, date: string, amountCents: number, payableAccountId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.paymentEntryId) return;
  const entry = await postJournal({
    date,
    memo: `Paid ${invoice.vendorName} ${invoice.invoiceNumber}`,
    source: "payment",
    sourceKey: `payment:${invoice.id}`,
    lines: paymentPosting(payableAccountId, paymentAccountId, amountCents),
  });
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { paymentEntryId: entry.id, paymentAccountId, status: "paid" },
  });
}

export async function markInvoicePaid(invoiceId: string, paymentAccountId: string, date: string) {
  const { byKey } = await accountMap();
  const payable = byKey.get("ap");
  if (!payable) throw new Error("The supplier bills account is missing.");
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { lines: true } });
  if (!invoice) throw new Error("That invoice is gone.");
  const amount = invoice.lines.reduce((sum, line) => sum + line.amountCents, 0) || invoice.totalCents;
  await payInvoice(invoiceId, paymentAccountId, date, amount, payable.id);
}

export async function postManual(input: { date: string; memo: string; lines: PostingLine[] }) {
  if (!input.memo) throw new Error("Say what this adjustment is for.");
  return postJournal({
    date: input.date,
    memo: input.memo,
    source: "manual",
    sourceKey: `manual:${randomUUID()}`,
    lines: input.lines,
  });
}

export async function postDepreciation(assetId: string, months: number, date: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error("That piece of equipment is gone.");
  if (!asset.depreciate) throw new Error("Turn on depreciation for this item first. It stays off until you choose.");
  const { byKey } = await accountMap();
  const expense = byKey.get("depreciation");
  const accum = byKey.get("accum_depr");
  if (!expense || !accum) throw new Error("The depreciation accounts are missing.");
  const amount = depreciationAmount(asset.costCents, asset.depreciatedCents, asset.usefulLifeMonths, months);
  if (amount <= 0) throw new Error("Nothing left to depreciate.");
  const entry = await postJournal({
    date,
    memo: `Depreciation: ${asset.name}`,
    source: "depreciation",
    sourceKey: `depr:${asset.id}:${date}:${months}`,
    lines: [
      { accountId: expense.id, debitCents: amount, creditCents: 0 },
      { accountId: accum.id, debitCents: 0, creditCents: amount },
    ],
  });
  await prisma.asset.update({ where: { id: asset.id }, data: { depreciatedCents: asset.depreciatedCents + amount } });
  return entry;
}

export async function postShopifyToBooks() {
  const { byKey } = await accountMap();
  const need = ["shopify_clearing", "sales", "discounts", "cogs", "inventory"] as const;
  if (need.some((key) => !byKey.get(key))) throw new Error("The starter accounts are missing.");
  const orders = await prisma.saleOrder.findMany({ include: { lines: true, refunds: { include: { lines: true } } } });
  const days = new Map<string, { sales: number; refunds: number; cogs: number }>();
  for (const order of orders) {
    const day = chicagoDateKey(order.processedAt);
    const bucket = days.get(day) || { sales: 0, refunds: 0, cogs: 0 };
    for (const line of order.lines) {
      bucket.sales += line.qty * line.unitPriceCents;
      if (line.unitCostCents) bucket.cogs += line.qty * line.unitCostCents;
    }
    for (const refund of order.refunds) {
      for (const line of refund.lines) {
        bucket.refunds += line.amountCents;
        if (line.unitCostCents) bucket.cogs -= line.qty * line.unitCostCents;
      }
    }
    days.set(day, bucket);
  }
  let posted = 0;
  for (const [day, bucket] of days) {
    const key = `shopify-day:${day}`;
    const existing = await prisma.journalEntry.findUnique({ where: { sourceKey: key } });
    if (existing) continue;
    let lines = shopifyDayPosting({
      salesCents: bucket.sales,
      refundCents: bucket.refunds,
      cogsCents: Math.max(0, bucket.cogs),
      clearingId: byKey.get("shopify_clearing")!.id,
      salesId: byKey.get("sales")!.id,
      refundsId: byKey.get("discounts")!.id,
      cogsId: byKey.get("cogs")!.id,
      inventoryId: byKey.get("inventory")!.id,
    });
    if (bucket.cogs < 0) {
      lines = lines.concat([
        { accountId: byKey.get("inventory")!.id, debitCents: -bucket.cogs, creditCents: 0, memo: "Refunded goods" },
        { accountId: byKey.get("cogs")!.id, debitCents: 0, creditCents: -bucket.cogs, memo: "Refunded goods" },
      ]);
    }
    if (!lines.length || !entryBalances(lines)) continue;
    await postJournal({ date: day, memo: `Shopify sales ${day}`, source: "shopify", sourceKey: key, lines });
    posted += 1;
  }
  return posted;
}

export async function ledgerMovements(): Promise<{ accounts: LedgerAccount[]; lines: LedgerMovement[] }> {
  const { rows } = await accountMap();
  const journal = await prisma.journalLine.findMany({ include: { entry: true } });
  return {
    accounts: rows.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type as LedgerAccount["type"],
      contra: account.contra,
    })),
    lines: journal.map((line) => ({
      accountId: line.accountId,
      entryDate: dayStamp(line.entry.entryDate),
      debitCents: line.debitCents,
      creditCents: line.creditCents,
      memo: line.memo,
      entryMemo: line.entry.memo,
    })),
  };
}

export async function saveCustomValues(entity: string, recordId: string, form: FormData) {
  const fields = await prisma.customField.findMany({ where: { entity, hidden: false } });
  for (const field of fields) {
    const value = String(form.get(`custom:${field.id}`) ?? "");
    await prisma.customFieldValue.upsert({
      where: { fieldId_recordId: { fieldId: field.id, recordId } },
      update: { value },
      create: { fieldId: field.id, recordId, value },
    });
  }
}

export async function customValues(entity: string, recordId: string) {
  const fields = await prisma.customField.findMany({ where: { entity }, orderBy: { sortOrder: "asc" }, include: { values: { where: { recordId } } } });
  return fields.map((field) => ({ ...field, value: field.values[0]?.value || "" }));
}
