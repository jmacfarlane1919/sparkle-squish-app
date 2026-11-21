import { prisma } from "@/lib/db";
import { saveBytes } from "@/lib/storage";

export async function exportBackup() {
  const payload = {
    exportedAt: new Date().toISOString(),
    shop: "Sparkle & Squish",
    categories: await prisma.category.findMany(),
    barcode: await prisma.barcodeCounter.findUnique({ where: { id: "series" } }),
    suppliers: await prisma.supplier.findMany(),
    locations: await prisma.location.findMany(),
    products: await prisma.product.findMany({
      include: { variants: { include: { levels: true } }, photos: true },
    }),
    purchaseOrders: await prisma.purchaseOrder.findMany({
      include: { lines: true, receipts: { include: { lines: true } } },
    }),
    counts: await prisma.inventoryCount.findMany({ include: { lines: true } }),
    orders: await prisma.saleOrder.findMany({
      include: { lines: true, refunds: { include: { lines: true } } },
    }),
    flags: await prisma.featureFlag.findMany(),
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `backups/ss-backup-${stamp}.json`;
  await saveBytes(key, Buffer.from(JSON.stringify(payload, null, 2)), "application/json");
  await prisma.appSetting.upsert({
    where: { key: "last_backup" },
    update: { value: key },
    create: { key: "last_backup", value: key },
  });
  await prisma.syncRun.create({
    data: { kind: "backup", status: "ok", detail: key, finishedAt: new Date() },
  });
  return key;
}
