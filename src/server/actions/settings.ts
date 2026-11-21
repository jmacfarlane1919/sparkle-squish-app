"use server";

import { revalidatePath } from "next/cache";
import { getAppUrl, isDemoMode } from "@/lib/env";
import { FEATURES, type FeatureKey } from "@/lib/features";
import { normalizeCategory } from "@/lib/identifiers";
import {
  buildBrandedPhotoOperations,
  buildProductBasicsOperations,
  buildReceiveCostOperation,
  buildReceiveStockOperation,
  buildCycleCountSetOperation,
  buildWebhookOperations,
  describeProductWrite,
} from "@/lib/shopify/payloads";
import { prisma } from "@/lib/db";
import { exportBackup } from "@/server/backup";
import { executeFeature } from "@/server/shopify-exec";
import { importFromShopify, reconcile } from "@/server/shopify-sync";
import { seedDemo } from "@/server/seed-demo";
import { dateOnly } from "@/lib/labels/queue";
import { go } from "@/server/nav";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

const sampleProduct = {
  shopifyProductId: "gid://shopify/Product/SAMPLE",
  title: "Peach Mochi Bear",
  description: "A soft peach squishy.",
  status: "active" as const,
  brand: "Mochi Lane",
  texture: "mochi",
  season: "spring",
  size: "palm",
  material: "TPE",
  ageGuidance: "3+",
  newArrival: false,
  receivedAt: "2026-11-01",
  variants: [
    {
      shopifyVariantId: "gid://shopify/ProductVariant/SAMPLE",
      priceCents: 1400,
      vendorSku: "MOCHI-BEAR-PCH",
      vendorBarcode: "810045551203",
      ssSku: "SS-SQ-043-STD",
      ssBarcode: "2000000003474",
      title: "Default Title",
    },
  ],
};

function sampleOperations(feature: FeatureKey) {
  if (feature === "product_basics") return buildProductBasicsOperations(sampleProduct);
  if (feature === "product_photos") {
    return buildBrandedPhotoOperations({
      filename: "peach-mochi-bear.jpg",
      mimeType: "image/jpeg",
      alt: "Peach Mochi Bear",
      existingFileId: null,
    });
  }
  if (feature === "receive_stock") {
    return [
      buildReceiveStockOperation({
        delta: 6,
        inventoryItemId: "gid://shopify/InventoryItem/SAMPLE",
        locationId: "gid://shopify/Location/SAMPLE",
        referenceDocumentUri: "app://purchase-orders/PO-1054",
        idempotencyKey: "44444444-4444-4444-8444-444444444444",
      }),
    ];
  }
  if (feature === "receive_cost") {
    return [buildReceiveCostOperation({ inventoryItemId: "gid://shopify/InventoryItem/SAMPLE", costCents: 640 })];
  }
  if (feature === "cycle_count") {
    return [
      buildCycleCountSetOperation({
        inventoryItemId: "gid://shopify/InventoryItem/SAMPLE",
        locationId: "gid://shopify/Location/SAMPLE",
        quantity: 18,
        changeFromQuantity: 18,
        referenceDocumentUri: "app://counts/sample",
        idempotencyKey: "55555555-5555-4555-8555-555555555555",
      }),
    ];
  }
  return buildWebhookOperations(getAppUrl());
}

export async function previewFeature(formData: FormData) {
  const key = text(formData, "feature") as FeatureKey;
  if (!FEATURES.some((feature) => feature.key === key)) go("/settings", { error: "Unknown switch." });
  const operations = sampleOperations(key);
  const summary = key === "product_basics" ? describeProductWrite(sampleProduct) : `Dry run for ${key}. Nothing is sent by a preview.`;
  const result = await executeFeature(key, "Dry-run preview", summary, operations);
  go("/settings", { notice: result.result });
}

export async function toggleFeature(formData: FormData) {
  const key = text(formData, "feature");
  const feature = FEATURES.find((item) => item.key === key);
  if (!feature) go("/settings", { error: "Unknown switch." });
  const current = await prisma.featureFlag.findUnique({ where: { key } });
  const enabled = !(current?.enabled ?? false);
  await prisma.featureFlag.upsert({
    where: { key },
    update: { enabled },
    create: { ...feature, enabled },
  });
  go("/settings", {
    notice: enabled ? `${feature.label} is on. New changes in that area will be sent to Shopify.` : `${feature.label} is off.`,
  });
}

export async function toggleNiimbotBluetooth() {
  const current = await prisma.appSetting.findUnique({ where: { key: "niimbot_bluetooth" } });
  const enabled = current?.value !== "on";
  await prisma.appSetting.upsert({
    where: { key: "niimbot_bluetooth" },
    update: { value: enabled ? "on" : "off" },
    create: { key: "niimbot_bluetooth", value: enabled ? "on" : "off" },
  });
  revalidatePath("/labels");
  go("/settings", {
    notice: enabled
      ? "Bluetooth printing is on. It shows on Needs labels and does not mark anything printed."
      : "Bluetooth printing is off.",
  });
}

export async function saveLabelCutoff(formData: FormData) {
  const cutoff = dateOnly(text(formData, "cutoff"));
  if (!cutoff) go("/settings", { error: "Use a date like 2026-11-06." });
  await prisma.appSetting.upsert({
    where: { key: "labels_printed_through" },
    update: { value: cutoff },
    create: { key: "labels_printed_through", value: cutoff },
  });
  go("/settings", { notice: `Labels are marked printed through ${cutoff}. The next Shopify import uses that date.` });
}

export async function saveCategory(formData: FormData) {
  const code = text(formData, "code");
  const name = text(formData, "name");
  let clean = "";
  try {
    clean = normalizeCategory(code);
  } catch (error) {
    go("/settings", { error: error instanceof Error ? error.message : "Check the category code." });
  }
  if (!name) go("/settings", { error: "Give the category a name. CY, GM, and SP can stay as the code until you rename them." });
  const existing = await prisma.category.findUnique({ where: { code: clean } });
  if (existing) {
    await prisma.category.update({ where: { code: clean }, data: { name } });
  } else {
    const count = await prisma.category.count();
    await prisma.category.create({ data: { code: clean, name, sortOrder: count + 1 } });
  }
  go("/settings", { notice: `${clean} is saved as ${name}.` });
}

export async function runReconcile() {
  const result = await reconcile("settings");
  revalidatePath("/");
  go("/settings", { notice: result.detail });
}

export async function runImport() {
  const result = await importFromShopify();
  revalidatePath("/");
  go(result.status === "ok" ? "/products" : "/settings", { notice: result.detail });
}

export async function runBackup() {
  const key = await exportBackup();
  go("/settings", { notice: `Backup saved as ${key}.` });
}

export async function reloadDemo(formData: FormData) {
  if (!isDemoMode()) go("/settings", { error: "Demo data is not loaded while a Shopify token is set." });
  if (text(formData, "confirm") !== "yes") go("/settings", { error: "Check the box to replace the catalog with the sample shop." });
  await seedDemo();
  revalidatePath("/");
  go("/", { notice: "The sample shop is loaded again." });
}
