"use server";

import { revalidatePath } from "next/cache";
import { shopifyConfigured } from "@/lib/env";
import { chicagoDateKey, dollarsToCents } from "@/lib/format";
import {
  LAST_ISSUED_BARCODE,
  allocateBarcode,
  allocateProductSku,
  allocateUniqueSku,
  normalizeCategory,
  normalizeVariantCode,
  parseSsSku,
} from "@/lib/identifiers";
import { prisma } from "@/lib/db";
import { readBytes, saveBytes } from "@/lib/storage";
import { buildBrandedPhotoOperations, buildProductBasicsOperations, describeProductWrite, type ProductWriteInput } from "@/lib/shopify/payloads";
import { runShopifyOperation } from "@/lib/shopify/client";
import { recordAudit } from "@/server/audit";
import { executeFeature, featureEnabled } from "@/server/shopify-exec";
import { enqueueNewProduct } from "@/server/label-queue";
import { retiredCodes } from "@/server/retired-codes";
import { friendlyError } from "@/lib/friendly-error";
import { go, rethrowNavigation } from "@/server/nav";

function requiredText(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

async function writeInput(productId: string): Promise<ProductWriteInput | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: { position: "asc" } } },
  });
  if (!product) return null;
  const status = product.status === "draft" || product.status === "archived" ? product.status : "active";
  return {
    shopifyProductId: product.shopifyProductId,
    title: product.title,
    description: product.description,
    status,
    brand: product.brand,
    texture: product.texture,
    season: product.season,
    size: product.size,
    material: product.material,
    ageGuidance: product.ageGuidance,
    newArrival: product.newArrival,
    receivedAt: product.receivedAt ? chicagoDateKey(product.receivedAt) : null,
    variants: product.variants.map((variant) => ({
      shopifyVariantId: variant.shopifyVariantId,
      priceCents: variant.priceCents,
      vendorSku: variant.vendorSku,
      vendorBarcode: variant.vendorBarcode,
      ssSku: variant.ssSku,
      ssBarcode: variant.ssBarcode,
      title: variant.title === "Default" ? "Default Title" : variant.title,
    })),
  };
}

export async function pushProduct(productId: string) {
  const input = await writeInput(productId);
  if (!input) return { mode: "error" as const, result: "Product was not found." };
  const summary = describeProductWrite(input);
  const live = (await featureEnabled("product_basics")) && shopifyConfigured() && !input.shopifyProductId;
  if (!live) {
    return executeFeature("product_basics", "Push product", summary, buildProductBasicsOperations(input));
  }
  const createOp = buildProductBasicsOperations(input).find((operation) => operation.name === "productSet");
  if (!createOp) return { mode: "error" as const, result: "No product create was prepared." };
  const created = await executeFeature("product_basics", "Create product on Shopify", summary, [createOp]);
  if (created.mode !== "live") return created;
  const parsed = JSON.parse(created.result) as {
    productSet?: { product?: { id?: string; variants?: { nodes?: { id: string; inventoryItem?: { id?: string } }[] } } };
  }[];
  const remote = parsed[0]?.productSet?.product;
  if (!remote?.id) return { mode: "error" as const, result: "Shopify did not return a product id." };
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: { position: "asc" } } },
  });
  if (!product) return created;
  await prisma.product.update({ where: { id: productId }, data: { shopifyProductId: remote.id } });
  const nodes = remote.variants?.nodes ?? [];
  for (const [index, variant] of product.variants.entries()) {
    const node = nodes[index];
    if (!node) continue;
    await prisma.variant.update({
      where: { id: variant.id },
      data: { shopifyVariantId: node.id, shopifyInventoryItemId: node.inventoryItem?.id ?? null },
    });
  }
  const refreshed = await writeInput(productId);
  if (!refreshed) return created;
  const metafields = buildProductBasicsOperations(refreshed).filter((operation) => operation.name === "metafieldsSet");
  return executeFeature("product_basics", "Set S&S metafields", describeProductWrite(refreshed), metafields);
}

export async function createProduct(formData: FormData) {
  const title = requiredText(formData, "title");
  const category = requiredText(formData, "category");
  const price = dollarsToCents(requiredText(formData, "price"));
  const costRaw = requiredText(formData, "cost");
  const cost = costRaw ? dollarsToCents(costRaw) : null;
  if (!title) go("/products/new", { error: "Add a product name." });
  if (price == null) go("/products/new", { error: "Enter the price in dollars, like 14.00." });
  if (costRaw && cost == null) go("/products/new", { error: "Enter the cost in dollars, or leave it blank." });
  let categoryCode = "";
  try {
    categoryCode = normalizeCategory(category);
  } catch (error) {
    rethrowNavigation(error);
    go("/products/new", { error: friendlyError(error) });
  }
  const variantCode = normalizeVariantCode(requiredText(formData, "variantCode") || "STD");
  const supplierId = requiredText(formData, "supplierId");

  const retired = await retiredCodes();
  const product = await prisma.$transaction(async (tx) => {
    const existing = await tx.variant.findMany({ select: { ssSku: true, ssBarcode: true } });
    const counter = await tx.barcodeCounter.findUnique({ where: { id: "series" } });
    const ssSku = allocateProductSku(categoryCode, [...existing.map((row) => row.ssSku).filter(Boolean), ...retired.skus], variantCode);
    const ssBarcode = allocateBarcode(counter?.lastIssued || LAST_ISSUED_BARCODE, [...existing.map((row) => row.ssBarcode).filter(Boolean), ...retired.barcodes]);
    const created = await tx.product.create({
      data: {
        title,
        description: requiredText(formData, "description"),
        status: requiredText(formData, "status") || "active",
        categoryCode,
        brand: requiredText(formData, "brand"),
        texture: requiredText(formData, "texture"),
        season: requiredText(formData, "season"),
        size: requiredText(formData, "size"),
        material: requiredText(formData, "material"),
        ageGuidance: requiredText(formData, "ageGuidance"),
        newArrival: checked(formData, "newArrival"),
        supplierId: supplierId || null,
        variants: {
          create: {
            title: "Default",
            variantCode,
            vendorSku: requiredText(formData, "vendorSku"),
            vendorBarcode: requiredText(formData, "vendorBarcode"),
            ssSku,
            ssBarcode,
            priceCents: price,
            costCents: cost,
          },
        },
      },
      include: { variants: true },
    });
    const locations = await tx.location.findMany();
    if (locations.length && created.variants[0]) {
      await tx.stockLevel.createMany({
        data: locations.map((location) => ({ variantId: created.variants[0].id, locationId: location.id, available: 0 })),
      });
    }
    await tx.barcodeCounter.upsert({
      where: { id: "series" },
      update: { lastIssued: ssBarcode },
      create: { id: "series", lastIssued: ssBarcode },
    });
    return created;
  });

  await pushProduct(product.id);
  if (product.variants[0]) await enqueueNewProduct(product.variants[0].id, 0);
  revalidatePath("/");
  const variant = product.variants[0];
  go(`/products/${product.id}`, {
    notice: `Saved ${product.title}. S&S SKU ${variant?.ssSku}, barcode ${variant?.ssBarcode}.`,
  });
}

export async function updateProduct(formData: FormData) {
  const id = requiredText(formData, "id");
  const title = requiredText(formData, "title");
  const price = dollarsToCents(requiredText(formData, "price"));
  const costRaw = requiredText(formData, "cost");
  const cost = costRaw ? dollarsToCents(costRaw) : null;
  if (!title || price == null || (costRaw && cost == null)) {
    go(`/products/${id}`, { error: "Check the name, price, and cost." });
  }
  const supplierId = requiredText(formData, "supplierId");
  await prisma.product.update({
    where: { id },
    data: {
      title,
      description: requiredText(formData, "description"),
      status: requiredText(formData, "status") || "active",
      categoryCode: requiredText(formData, "category"),
      brand: requiredText(formData, "brand"),
      texture: requiredText(formData, "texture"),
      season: requiredText(formData, "season"),
      size: requiredText(formData, "size"),
      material: requiredText(formData, "material"),
      ageGuidance: requiredText(formData, "ageGuidance"),
      newArrival: checked(formData, "newArrival"),
      supplierId: supplierId || null,
    },
  });
  const variantId = requiredText(formData, "variantId");
  if (variantId) {
    await prisma.variant.update({
      where: { id: variantId },
      data: {
        priceCents: price,
        costCents: cost,
        vendorSku: requiredText(formData, "vendorSku"),
        vendorBarcode: requiredText(formData, "vendorBarcode"),
      },
    });
  }
  const result = await pushProduct(id);
  revalidatePath(`/products/${id}`);
  go(`/products/${id}`, { notice: `Saved. ${result.result}` });
}

export async function addVariant(formData: FormData) {
  const productId = requiredText(formData, "productId");
  const price = dollarsToCents(requiredText(formData, "price"));
  if (price == null) go(`/products/${productId}`, { error: "Enter a price for the new variant." });
  const costRaw = requiredText(formData, "cost");
  const cost = costRaw ? dollarsToCents(costRaw) : null;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: true },
  });
  if (!product) go("/products", { error: "That product is gone." });
  const anchor = product.variants.find((variant) => parseSsSku(variant.ssSku));
  const parsed = anchor ? parseSsSku(anchor.ssSku) : null;
  const all = await prisma.variant.findMany({ select: { ssSku: true, ssBarcode: true } });
  const retired = await retiredCodes();
  const variantCode = normalizeVariantCode(requiredText(formData, "variantCode") || "STD");
  const skuPool = [...all.map((row) => row.ssSku), ...retired.skus];
  const ssSku = parsed
    ? allocateUniqueSku(parsed.category, parsed.number, variantCode, skuPool)
    : allocateProductSku(product.categoryCode || "SQ", skuPool, variantCode);
  const counter = await prisma.barcodeCounter.findUnique({ where: { id: "series" } });
  const ssBarcode = allocateBarcode(counter?.lastIssued || LAST_ISSUED_BARCODE, [...all.map((row) => row.ssBarcode).filter(Boolean), ...retired.barcodes]);
  const locations = await prisma.location.findMany();
  const createdVariant = await prisma.$transaction(async (tx) => {
    const created = await tx.variant.create({
      data: {
        productId,
        title: requiredText(formData, "title") || variantCode,
        variantCode,
        vendorSku: requiredText(formData, "vendorSku"),
        vendorBarcode: requiredText(formData, "vendorBarcode"),
        ssSku,
        ssBarcode,
        priceCents: price,
        costCents: cost,
        position: product.variants.length,
      },
    });
    if (locations.length) {
      await tx.stockLevel.createMany({
        data: locations.map((location) => ({ variantId: created.id, locationId: location.id, available: 0 })),
      });
    }
    await tx.barcodeCounter.update({ where: { id: "series" }, data: { lastIssued: ssBarcode } });
    return created;
  });
  await enqueueNewProduct(createdVariant.id, 0);
  await pushProduct(productId);
  go(`/products/${productId}`, { notice: `Added variant ${ssSku}.` });
}

export async function uploadPhoto(formData: FormData) {
  const productId = requiredText(formData, "productId");
  const role = requiredText(formData, "role") === "branded" ? "branded" : "original";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) go(`/products/${productId}`, { error: "Choose a photo first." });
  if (file.size > 8 * 1024 * 1024) go(`/products/${productId}`, { error: "Photos need to be under 8 MB." });
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
  if (!allowed.has(file.type)) go(`/products/${productId}`, { error: "Use a JPG, PNG, WEBP, GIF, or SVG." });
  const extension = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1] || "img";
  const key = `photos/${productId}-${Date.now()}.${extension}`;
  await saveBytes(key, Buffer.from(await file.arrayBuffer()), file.type);
  const photo = await prisma.photo.create({
    data: {
      productId,
      role,
      storageKey: key,
      contentType: file.type,
      alt: requiredText(formData, "alt") || "Product photo",
    },
  });
  if (role === "branded") await pushBrandedPhoto(photo.id);
  revalidatePath(`/products/${productId}`);
  go(`/products/${productId}`, {
    notice: role === "original" ? "Original photo stored in S&S Software." : "Branded photo saved.",
  });
}

export async function sendBrandedPhoto(formData: FormData) {
  const photoId = requiredText(formData, "photoId");
  const productId = requiredText(formData, "productId");
  const result = await pushBrandedPhoto(photoId);
  go(`/products/${productId}`, { notice: result?.result || "Photo preview saved." });
}

async function pushBrandedPhoto(photoId: string) {
  const photo = await prisma.photo.findUnique({ where: { id: photoId }, include: { product: { include: { variants: true } } } });
  if (!photo || photo.role !== "branded") return { mode: "error" as const, result: "Only branded photos are sent to Shopify." };
  const bytes = await readBytes(photo.storageKey);
  if (!bytes) return { mode: "error" as const, result: "The photo file is missing." };
  const filename = `${photo.product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product"}.${photo.contentType === "image/svg+xml" ? "svg" : "img"}`;
  const operations = buildBrandedPhotoOperations({
    filename,
    mimeType: photo.contentType,
    alt: photo.alt || photo.product.title,
    existingFileId: photo.shopifyFileId,
    shopifyProductId: photo.product.shopifyProductId,
    shopifyVariantId: photo.product.variants[0]?.shopifyVariantId,
  });
  const summary = `Branded photo for ${photo.product.title}. Originals stay in S&S Software.`;
  if (!(await featureEnabled("product_photos")) || !shopifyConfigured()) {
    return executeFeature("product_photos", "Push branded photo", summary, operations);
  }
  try {
    const staged = await runShopifyOperation(operations[0]);
    const target = (staged.stagedUploadsCreate as { stagedTargets: { url: string; resourceUrl: string; parameters: { name: string; value: string }[] }[] }).stagedTargets[0];
    const body = new FormData();
    for (const parameter of target.parameters) body.append(parameter.name, parameter.value);
    body.append("file", new Blob([new Uint8Array(bytes)]), filename);
    const upload = await fetch(target.url, { method: "POST", body });
    if (!upload.ok) throw new Error(`Shopify file upload returned ${upload.status}.`);
    const createdResults = [];
    for (const operation of operations.slice(1)) {
      createdResults.push(
        await runShopifyOperation({
          ...operation,
          variables: JSON.parse(JSON.stringify(operation.variables).replaceAll("STAGED_RESOURCE_URL", target.resourceUrl)) as Record<string, unknown>,
        }),
      );
    }
    const created = (createdResults[0] || {}) as Record<string, unknown>;
    const files = (created.fileCreate as { files?: { id: string }[] } | undefined)?.files
      || (created.fileUpdate as { files?: { id: string }[] } | undefined)?.files
      || [];
    await prisma.photo.update({
      where: { id: photo.id },
      data: { shopifyFileId: files[0]?.id || photo.shopifyFileId, pushedAt: new Date() },
    });
    await recordAudit({
      feature: "product_photos",
      action: "Push branded photo",
      mode: "live",
      summary,
      payload: JSON.stringify(operations, null, 2),
      result: "Uploaded with fileCreate or fileUpdate.",
    });
    return { mode: "live" as const, result: "Branded photo sent to Shopify." };
  } catch (error) {
    rethrowNavigation(error);
    const result = friendlyError(error);
    await recordAudit({ feature: "product_photos", action: "Push branded photo", mode: "error", summary, result });
    return { mode: "error" as const, result };
  }
}

export async function sendProduct(formData: FormData) {
  const id = requiredText(formData, "id");
  const result = await pushProduct(id);
  go(`/products/${id}`, { notice: result.result });
}
