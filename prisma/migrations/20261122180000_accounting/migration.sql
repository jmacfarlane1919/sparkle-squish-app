-- Books: chart of accounts, journal, expenses, assets, reconciliation, custom fields.
-- Additive only. Existing invoices keep every column they already have.

ALTER TABLE "Invoice" ADD COLUMN "whereName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN "whereUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN "whereAddress" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invoice" ADD COLUMN "paymentAccountId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "billEntryId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "paymentEntryId" TEXT;

CREATE UNIQUE INDEX "Invoice_billEntryId_key" ON "Invoice"("billEntryId");
CREATE UNIQUE INDEX "Invoice_paymentEntryId_key" ON "Invoice"("paymentEntryId");

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contra" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,
    "systemKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");
CREATE UNIQUE INDEX "Account_systemKey_key" ON "Account"("systemKey");

CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JournalEntry_sourceKey_key" ON "JournalEntry"("sourceKey");
CREATE INDEX "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");

CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitCents" INTEGER NOT NULL DEFAULT 0,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "memo" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "vendorName" TEXT NOT NULL,
    "supplierId" TEXT,
    "paymentAccountId" TEXT NOT NULL,
    "whereName" TEXT NOT NULL DEFAULT '',
    "whereUrl" TEXT NOT NULL DEFAULT '',
    "whereAddress" TEXT NOT NULL DEFAULT '',
    "memo" TEXT NOT NULL DEFAULT '',
    "totalCents" INTEGER NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Expense_journalEntryId_key" ON "Expense"("journalEntryId");
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");

CREATE TABLE "ExpenseLine" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "isAsset" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ExpenseLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "isAsset" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "costCents" INTEGER NOT NULL,
    "usefulLifeMonths" INTEGER,
    "depreciate" BOOLEAN NOT NULL DEFAULT false,
    "accountId" TEXT NOT NULL,
    "expenseLineId" TEXT,
    "invoiceLineId" TEXT,
    "whereName" TEXT NOT NULL DEFAULT '',
    "whereUrl" TEXT NOT NULL DEFAULT '',
    "whereAddress" TEXT NOT NULL DEFAULT '',
    "depreciatedCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Asset_expenseLineId_key" ON "Asset"("expenseLineId");
CREATE UNIQUE INDEX "Asset_invoiceLineId_key" ON "Asset"("invoiceLineId");

CREATE TABLE "AccountingFile" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "expenseId" TEXT,
    "assetId" TEXT,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "endingBalanceCents" INTEGER NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReconciliationMark" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "journalLineId" TEXT NOT NULL,
    CONSTRAINT "ReconciliationMark_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReconciliationMark_reconciliationId_journalLineId_key" ON "ReconciliationMark"("reconciliationId", "journalLineId");

CREATE TABLE "StatementLine" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "lineDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amountCents" INTEGER NOT NULL,
    "journalLineId" TEXT,
    CONSTRAINT "StatementLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "options" TEXT NOT NULL DEFAULT '',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomFieldValue_fieldId_recordId_key" ON "CustomFieldValue"("fieldId", "recordId");

ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_expenseLineId_fkey" FOREIGN KEY ("expenseLineId") REFERENCES "ExpenseLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingFile" ADD CONSTRAINT "AccountingFile_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingFile" ADD CONSTRAINT "AccountingFile_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationMark" ADD CONSTRAINT "ReconciliationMark_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatementLine" ADD CONSTRAINT "StatementLine_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
