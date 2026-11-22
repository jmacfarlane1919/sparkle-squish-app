import { randomUUID } from "node:crypto";
import { unzipSync } from "fflate";
import { getOwnerCredentials } from "@/lib/env";
import {
  assignmentFor,
  contentTypeFor,
  newAttachmentNames,
  planInvoiceImport,
  type InvoiceImportPlan,
  type PlannedFile,
  type PlannedInvoice,
} from "@/lib/invoices/match";
import { prisma } from "@/lib/db";
import { deleteBytes, readBytes, saveBytes } from "@/lib/storage";

export type InvoiceDraft = InvoiceImportPlan & {
  id: string;
  files: (PlannedFile & { storageKey: string })[];
};

const MANIFEST = (id: string) => `invoice-drafts/${id}/manifest.json`;

export function isOwnerEmail(email: string) {
  return email.trim().toLowerCase() === getOwnerCredentials().email.toLowerCase();
}

function zipEntries(bytes: Uint8Array) {
  const opened = unzipSync(bytes);
  const used = new Set<string>();
  const files: { filename: string; bytes: Uint8Array }[] = [];
  for (const [path, data] of Object.entries(opened)) {
    if (!data.length || path.endsWith("/")) continue;
    const base = path.split("/").pop() || "";
    if (!base || base.startsWith(".") || path.includes("__MACOSX") || path.split("/").includes("..")) continue;
    files.push({ filename: uniqueFilename(base, used), bytes: data });
  }
  return files;
}

function uniqueFilename(name: string, used: Set<string>) {
  const clean = name.replace(/[^\w.\- ()]+/g, "_").slice(0, 180) || "file";
  if (!used.has(clean)) {
    used.add(clean);
    return clean;
  }
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";
  let count = 2;
  while (used.has(`${stem} (${count})${ext}`)) count += 1;
  const next = `${stem} (${count})${ext}`;
  used.add(next);
  return next;
}

export async function createInvoiceDraft(csv: string, zip: Uint8Array | null) {
  const [purchaseOrders, suppliers] = await Promise.all([
    prisma.purchaseOrder.findMany({ include: { supplier: true } }),
    prisma.supplier.findMany(),
  ]);
  const extracted = zip ? zipEntries(zip) : [];
  const plan = planInvoiceImport({
    csv,
    filenames: extracted.map((file) => file.filename),
    purchaseOrders: purchaseOrders.map((order) => ({
      id: order.id,
      number: order.number,
      invoiceNumber: order.invoiceNumber,
      supplierName: order.supplier.name,
    })),
    suppliers: suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name })),
  });
  const id = randomUUID();
  const files = extracted.map((file) => {
    const planned = plan.files.find((row) => row.filename === file.filename);
    return {
      filename: file.filename,
      invoiceKey: planned?.invoiceKey ?? null,
      candidates: planned?.candidates ?? [],
      storageKey: `invoice-drafts/${id}/files/${file.filename}`,
      bytes: file.bytes,
    };
  });
  for (const file of files) {
    await saveBytes(file.storageKey, Buffer.from(file.bytes), contentTypeFor(file.filename));
  }
  const draft: InvoiceDraft = {
    id,
    invoices: plan.invoices,
    files: files.map((file) => ({
      filename: file.filename,
      invoiceKey: file.invoiceKey,
      candidates: file.candidates,
      storageKey: file.storageKey,
    })),
    errors: plan.errors,
    collapsedDuplicates: plan.collapsedDuplicates,
  };
  await saveBytes(MANIFEST(id), Buffer.from(JSON.stringify(draft)), "application/json");
  return draft;
}

export async function readInvoiceDraft(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const bytes = await readBytes(MANIFEST(id));
  if (!bytes) return null;
  return JSON.parse(bytes.toString("utf8")) as InvoiceDraft;
}

export async function commitInvoiceDraft(draft: InvoiceDraft, choices: Map<string, string>) {
  const invoiceKeys = new Set(draft.invoices.map((invoice) => invoice.key));
  const chosen = new Map<string, string | null>();
  for (const file of draft.files) {
    chosen.set(file.filename, assignmentFor(file, choices.get(file.filename), invoiceKeys));
  }
  let attached = 0;
  let skipped = 0;
  for (const file of draft.files) {
    if (!chosen.get(file.filename)) skipped += 1;
  }
  for (const invoice of draft.invoices) {
    const saved = await saveInvoice(invoice);
    const incoming = draft.files.filter((file) => chosen.get(file.filename) === invoice.key).map((file) => file.filename);
    const existing = await prisma.invoiceAttachment.findMany({ where: { invoiceId: saved.id }, select: { filename: true } });
    const fresh = new Set(newAttachmentNames(existing.map((row) => row.filename), incoming));
    for (const file of draft.files) {
      if (!fresh.has(file.filename)) continue;
      const bytes = await readBytes(file.storageKey);
      if (!bytes) continue;
      const storageKey = `invoices/${saved.id}/${file.filename}`;
      await saveBytes(storageKey, bytes, contentTypeFor(file.filename));
      await prisma.invoiceAttachment.create({
        data: {
          invoiceId: saved.id,
          filename: file.filename,
          storageKey,
          contentType: contentTypeFor(file.filename),
        },
      });
      attached += 1;
    }
  }
  for (const file of draft.files) await deleteBytes(file.storageKey);
  await deleteBytes(MANIFEST(draft.id));
  return { invoices: draft.invoices.length, attached, skipped, errors: draft.errors.length };
}

async function saveInvoice(invoice: PlannedInvoice) {
  const invoiceDate = new Date(`${invoice.date}T12:00:00.000Z`);
  const data = {
    invoiceNumber: invoice.invoiceNumber,
    vendorName: invoice.vendor,
    supplierId: invoice.supplierId,
    invoiceDate,
    status: invoice.status,
    totalCents: invoice.totalCents,
    category: invoice.category,
    paidFrom: invoice.paidFrom,
    subtotalCents: invoice.subtotalCents,
    discountCents: invoice.discountCents,
    shippingCents: invoice.shippingCents,
    taxCents: invoice.taxCents,
    purchaseOrderId: invoice.purchaseOrderId,
  };
  return prisma.invoice.upsert({
    where: { dedupeKey: invoice.key },
    create: { dedupeKey: invoice.key, ...data },
    update: data,
  });
}
