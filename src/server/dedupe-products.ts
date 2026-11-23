import { groupDuplicateProducts, type DuplicateCandidate } from "@/lib/catalog/duplicates";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import { rememberRetired } from "@/server/retired-codes";

export async function findDuplicateProducts() {
  const products = await prisma.product.findMany({
    where: { shopifyProductId: null },
    include: {
      supplier: { select: { name: true } },
      photos: { select: { id: true } },
      variants: {
        include: {
          _count: {
            select: {
              poLines: true,
              receiptLines: true,
              levels: true,
              labelItems: true,
              saleLines: true,
              refundLines: true,
              countLines: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const rows: DuplicateCandidate[] = [];
  for (const product of products) {
    if (product.variants.some((variant) => variant.shopifyVariantId)) continue;
    const primary = product.variants[0];
    if (!primary) continue;
    const references = product.photos.length + product.variants.reduce((sum, variant) => {
      const count = variant._count;
      return sum + count.poLines + count.receiptLines + count.levels + count.labelItems + count.saleLines + count.refundLines + count.countLines;
    }, 0);
    rows.push({
      productId: product.id,
      title: product.title,
      supplierId: product.supplierId,
      supplierName: product.supplier?.name || "",
      vendorSku: primary.vendorSku,
      vendorBarcode: primary.vendorBarcode,
      shopifyProductId: product.shopifyProductId,
      ssSku: primary.ssSku,
      ssBarcode: primary.ssBarcode,
      createdAt: product.createdAt.getTime(),
      references,
      variantIds: product.variants.map((variant) => variant.id),
      keepVariantId: primary.id,
    });
  }
  return groupDuplicateProducts(rows);
}

async function moveVariant(fromId: string, toId: string) {
  await prisma.purchaseOrderLine.updateMany({ where: { variantId: fromId }, data: { variantId: toId } });
  await prisma.receiptLine.updateMany({ where: { variantId: fromId }, data: { variantId: toId } });
  await prisma.saleLine.updateMany({ where: { variantId: fromId }, data: { variantId: toId } });
  await prisma.refundLine.updateMany({ where: { variantId: fromId }, data: { variantId: toId } });
  const stock = await prisma.stockLevel.findMany({ where: { variantId: fromId } });
  for (const level of stock) {
    const kept = await prisma.stockLevel.findUnique({ where: { variantId_locationId: { variantId: toId, locationId: level.locationId } } });
    if (kept) {
      await prisma.stockLevel.update({ where: { id: kept.id }, data: { available: kept.available + level.available } });
      await prisma.stockLevel.delete({ where: { id: level.id } });
    } else {
      await prisma.stockLevel.update({ where: { id: level.id }, data: { variantId: toId } });
    }
  }
  const counts = await prisma.inventoryCountLine.findMany({ where: { variantId: fromId } });
  for (const line of counts) {
    const kept = await prisma.inventoryCountLine.findUnique({ where: { countId_variantId: { countId: line.countId, variantId: toId } } });
    if (kept) {
      await prisma.inventoryCountLine.update({ where: { id: kept.id }, data: { countedQty: kept.countedQty + line.countedQty } });
      await prisma.inventoryCountLine.delete({ where: { id: line.id } });
    } else {
      await prisma.inventoryCountLine.update({ where: { id: line.id }, data: { variantId: toId } });
    }
  }
  await prisma.labelQueueItem.updateMany({ where: { variantId: fromId }, data: { variantId: toId } });
}

export async function removeDuplicateProducts(onlyProductIds?: string[]) {
  const found = await findDuplicateProducts();
  const groups = onlyProductIds
    ? found.filter((group) => onlyProductIds.includes(group.keep.productId) || group.remove.some((row) => onlyProductIds.includes(row.productId)))
    : found;
  const retiredSkus: string[] = [];
  const retiredBarcodes: string[] = [];
  let removed = 0;
  for (const group of groups) {
    const photos = await prisma.photo.findMany({ where: { productId: { in: group.remove.map((row) => row.productId) } } });
    if (photos.length) {
      await prisma.photo.updateMany({ where: { id: { in: photos.map((photo) => photo.id) } }, data: { productId: group.keep.productId } });
    }
    for (const copy of group.remove) {
      for (const variantId of copy.variantIds) {
        await moveVariant(variantId, group.keep.keepVariantId);
      }
      retiredSkus.push(copy.ssSku);
      retiredBarcodes.push(copy.ssBarcode);
      await prisma.product.delete({ where: { id: copy.productId } });
      removed += 1;
    }
  }
  if (removed) await rememberRetired(retiredSkus, retiredBarcodes);
  const detail = removed
    ? `Removed ${removed} duplicate products across ${groups.length} groups. Kept the copy with the most history. Retired S&S codes stay retired.`
    : "No duplicate app-only products were found.";
  await prisma.syncRun.create({ data: { kind: "dedupe_products", status: "ok", detail, finishedAt: new Date() } });
  await recordAudit({
    feature: "product_basics",
    action: "Remove duplicate products",
    mode: "live",
    summary: detail,
    payload: JSON.stringify(groups.map((group) => ({
      title: group.title,
      keep: group.keep.ssSku,
      remove: group.remove.map((row) => row.ssSku),
    }))),
    result: "Shopify-linked products were not changed. The barcode series was not moved backward.",
  });
  return { removed, groups: groups.length, message: detail };
}
