"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { labelSize } from "@/lib/labels/sizes";
import { prisma } from "@/lib/db";
import { queueRows, snapshotFromRows } from "@/server/label-queue";
import { go } from "@/server/nav";

function parseQty(value: unknown) {
  const qty = Number(value);
  if (!Number.isInteger(qty) || qty < 0 || qty > 500) return null;
  return qty;
}

function readQueueForm(formData: FormData) {
  let qtys: { id: string; qty: number }[] = [];
  let selected: string[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("qtys") || "[]")) as { id?: string; qty?: number }[];
    qtys = parsed
      .map((row) => ({ id: String(row.id || ""), qty: parseQty(row.qty) }))
      .filter((row): row is { id: string; qty: number } => Boolean(row.id) && row.qty != null);
    selected = JSON.parse(String(formData.get("selected") || "[]")).map(String);
  } catch {
    qtys = [];
    selected = [];
  }
  return { qtys, selected, size: labelSize(String(formData.get("size") || "avery")).id };
}

export async function saveQueueQuantities(qtys: { id: string; qty: number }[]) {
  for (const row of qtys) {
    await prisma.labelQueueItem.updateMany({
      where: { id: row.id, status: "needs_labels" },
      data: { printQty: row.qty },
    });
  }
}

async function recordPrinted(formData: FormData) {
  const { qtys, selected, size } = readQueueForm(formData);
  if (!selected.length) go("/labels", { error: "Select at least one product." });
  await saveQueueQuantities(qtys);
  const qtyFor = new Map(qtys.map((row) => [row.id, row.qty]));
  const rows = (await queueRows("needs_labels")).filter((row) => selected.includes(row.id));
  const snapshot = snapshotFromRows(rows, qtyFor);
  if (!snapshot.length) go("/labels", { error: "Those rows need an S&S barcode and a count above zero." });
  const labelCount = snapshot.reduce((sum, row) => sum + row.qty, 0);
  const job = await prisma.labelPrintJob.create({
    data: {
      size,
      labelCount,
      snapshot: JSON.stringify(snapshot),
    },
  });
  await prisma.labelQueueItem.updateMany({
    where: { id: { in: snapshot.map((row) => row.queueItemId) }, status: "needs_labels" },
    data: { status: "printed", printedAt: job.printedAt, printJobId: job.id },
  });
  for (const row of snapshot) {
    await prisma.labelQueueItem.update({
      where: { id: row.queueItemId },
      data: { printedCount: row.qty, printQty: row.qty },
    });
  }
  revalidatePath("/labels");
  revalidatePath("/");
  revalidatePath("/inventory");
  return job;
}

export async function printLabels(formData: FormData) {
  const job = await recordPrinted(formData);
  redirect(`/api/labels/job/${job.id}`);
}

/** Marks the selected rows printed without sending them to a printer. */
export async function markLabelsPrinted(formData: FormData) {
  await recordPrinted(formData);
  go("/labels", { notice: "Marked as printed. Reprint any time from Printed." });
}

export async function undoPrintJob(formData: FormData) {
  const id = String(formData.get("id") || "");
  const job = await prisma.labelPrintJob.findUnique({ where: { id } });
  if (!job) go("/labels/history", { error: "That print batch is gone." });
  if (job.undoneAt) go("/labels/history", { error: "That batch is already back in Needs labels." });
  await prisma.labelQueueItem.updateMany({
    where: { printJobId: id, status: "printed" },
    data: { status: "needs_labels", printedAt: null, printedCount: 0 },
  });
  await prisma.labelPrintJob.update({ where: { id }, data: { undoneAt: new Date() } });
  revalidatePath("/labels");
  revalidatePath("/");
  go("/labels", { notice: "Those labels are back in Needs labels." });
}
