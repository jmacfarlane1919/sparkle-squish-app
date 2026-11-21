"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { planCycleCount } from "@/lib/cycle-count";
import { matchField } from "@/lib/identifiers";
import { prisma } from "@/lib/db";
import { executeFeature } from "@/server/shopify-exec";
import { go } from "@/server/nav";
import { shopifyConfigured } from "@/lib/env";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export async function startCount(formData: FormData) {
  const locationId = text(formData, "locationId");
  if (!locationId) go("/counts", { error: "Choose a location to count." });
  const open = await prisma.inventoryCount.findFirst({ where: { status: "open", locationId } });
  if (open) go(`/counts/${open.id}`, { notice: "This count is already open." });
  const count = await prisma.inventoryCount.create({
    data: { locationId, note: text(formData, "note") },
  });
  go(`/counts/${count.id}`, { notice: "Count started. Scan each item." });
}

export async function scanCount(formData: FormData) {
  const countId = text(formData, "countId");
  const code = text(formData, "code");
  const count = await prisma.inventoryCount.findUnique({ where: { id: countId } });
  if (!count || count.status !== "open") go("/counts", { error: "That count is closed." });
  const variants = await prisma.variant.findMany({ include: { product: true, levels: true } });
  const matches = variants.filter((variant) => matchField(variant, code));
  if (matches.length !== 1) {
    go(`/counts/${countId}`, {
      error: matches.length === 0 ? `No product matches ${code}.` : `${code} matches more than one product. Fix the duplicates first.`,
    });
  }
  const variant = matches[0];
  const existing = await prisma.inventoryCountLine.findUnique({
    where: { countId_variantId: { countId, variantId: variant.id } },
  });
  if (existing) {
    await prisma.inventoryCountLine.update({
      where: { id: existing.id },
      data: { countedQty: existing.countedQty + 1 },
    });
  } else {
    const system = variant.levels.find((level) => level.locationId === count.locationId)?.available ?? 0;
    await prisma.inventoryCountLine.create({
      data: { countId, variantId: variant.id, systemQtyAtStart: system, countedQty: 1 },
    });
  }
  go(`/counts/${countId}`, { notice: `Counted ${variant.product.title}.` });
}

export async function setCountedQty(formData: FormData) {
  const lineId = text(formData, "lineId");
  const countId = text(formData, "countId");
  const qty = Number(text(formData, "qty"));
  if (!Number.isInteger(qty) || qty < 0) go(`/counts/${countId}`, { error: "Enter a whole number." });
  await prisma.inventoryCountLine.update({ where: { id: lineId }, data: { countedQty: qty } });
  go(`/counts/${countId}`, { notice: "Quantity updated." });
}

export async function commitCount(formData: FormData) {
  const countId = text(formData, "countId");
  const count = await prisma.inventoryCount.findUnique({
    where: { id: countId },
    include: { lines: { include: { variant: { include: { product: true, levels: true } } } }, location: true },
  });
  if (!count || count.status !== "open") go("/counts", { error: "That count is already closed." });
  if (!count.lines.length) go(`/counts/${countId}`, { error: "Scan at least one item before committing." });
  const notes: string[] = [];
  for (const line of count.lines) {
    const sales = await prisma.saleLine.aggregate({
      where: {
        variantId: line.variantId,
        order: { processedAt: { gte: count.startedAt }, cancelled: false },
      },
      _sum: { qty: true },
    });
    const received = await prisma.receiptLine.aggregate({
      where: { variantId: line.variantId, receipt: { receivedAt: { gte: count.startedAt } } },
      _sum: { qty: true },
    });
    const current = line.variant.levels.find((level) => level.locationId === count.locationId)?.available ?? line.systemQtyAtStart;
    const plan = planCycleCount({
      countedQty: line.countedQty,
      changeFromQuantity: current,
      salesQtyDuringCount: sales._sum.qty ?? 0,
      receivedQtyDuringCount: received._sum.qty ?? 0,
      inventoryItemId: line.variant.shopifyInventoryItemId,
      locationId: count.location.shopifyLocationId || `gid://shopify/Location/local-${count.locationId}`,
      referenceDocumentUri: `app://counts/${count.id}`,
      idempotencyKey: randomUUID(),
    });
    if (plan.action === "skip") {
      const reason = plan.reason === "sales_during_count"
        ? `${line.variant.product.title} sold during the count, so the quantity was not replaced.`
        : `${line.variant.product.title} was received during the count, so the quantity was not replaced.`;
      await prisma.inventoryCountLine.update({
        where: { id: line.id },
        data: { salesDuringCount: sales._sum.qty ?? 0, commitAction: plan.reason, commitDetail: reason },
      });
      notes.push(reason);
      continue;
    }
    const summary = `Set ${line.variant.product.title} at ${count.location.name} to ${line.countedQty}.`;
    const outcome = plan.operation
      ? await executeFeature("cycle_count", "Commit count", summary, [plan.operation])
      : { mode: shopifyConfigured() ? "dry_run" : "dry_run", result: "Not linked to Shopify." };
    const applyLocal = outcome.mode === "live" || !shopifyConfigured();
    if (applyLocal) {
      await prisma.stockLevel.upsert({
        where: { variantId_locationId: { variantId: line.variantId, locationId: count.locationId } },
        update: { available: line.countedQty },
        create: { variantId: line.variantId, locationId: count.locationId, available: line.countedQty },
      });
    }
    await prisma.inventoryCountLine.update({
      where: { id: line.id },
      data: {
        salesDuringCount: sales._sum.qty ?? 0,
        commitAction: applyLocal ? "set" : outcome.mode,
        commitDetail: outcome.result,
      },
    });
    notes.push(`${line.variant.product.title}: ${outcome.result}`);
  }
  await prisma.inventoryCount.update({
    where: { id: countId },
    data: { status: "committed", committedAt: new Date() },
  });
  revalidatePath("/inventory");
  go(`/counts/${countId}`, { notice: notes.join(" ") });
}
