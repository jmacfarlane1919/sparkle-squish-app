import { isDemoProduct, isDemoPurchaseOrder, isDemoSale, isDemoSupplier } from "@/lib/demo-fingerprint";
import { prisma } from "@/lib/db";

export type DemoSeedCount = {
  products: number;
  suppliers: number;
  orders: number;
  purchaseOrders: number;
  locations: number;
};

export async function findDemoSeed() {
  const [products, suppliers, orders, purchaseOrders, locations] = await Promise.all([
    prisma.product.findMany({ include: { variants: true, supplier: true } }),
    prisma.supplier.findMany(),
    prisma.saleOrder.findMany(),
    prisma.purchaseOrder.findMany({ include: { supplier: true } }),
    prisma.location.findMany(),
  ]);
  const demoSuppliers = suppliers.filter((supplier) => isDemoSupplier(supplier));
  const demoSupplierIds = new Set(demoSuppliers.map((supplier) => supplier.id));
  const demoProducts = products.filter((product) =>
    isDemoProduct({
      title: product.title,
      shopifyProductId: product.shopifyProductId,
      demoSeed: product.demoSeed,
      skus: product.variants.map((variant) => variant.ssSku),
      shopifyVariantIds: product.variants.map((variant) => variant.shopifyVariantId),
    }),
  );
  const demoOrders = orders.filter((order) => isDemoSale(order));
  const demoPurchaseOrders = purchaseOrders.filter((order) =>
    isDemoPurchaseOrder({
      number: order.number,
      demoSeed: order.demoSeed,
      supplierIsDemo: demoSupplierIds.has(order.supplierId) || order.supplier.demoSeed,
    }),
  );
  return {
    products: demoProducts,
    suppliers: demoSuppliers,
    orders: demoOrders,
    purchaseOrders: demoPurchaseOrders,
    locations,
  };
}

export async function countDemoSeed(): Promise<DemoSeedCount> {
  const found = await findDemoSeed();
  return {
    products: found.products.length,
    suppliers: found.suppliers.length,
    orders: found.orders.length,
    purchaseOrders: found.purchaseOrders.length,
    locations: found.locations.filter((location) => location.demoSeed).length,
  };
}

export function demoSeedMessage(count: DemoSeedCount) {
  const total = count.products + count.suppliers + count.orders + count.purchaseOrders;
  if (total === 0) return "No sample shop rows were found. Real products and orders were left alone.";
  return `Sample shop: ${count.products} products, ${count.suppliers} suppliers, ${count.purchaseOrders} purchase orders, ${count.orders} sales.`;
}

export async function removeDemoSeed() {
  const found = await findDemoSeed();
  const productIds = found.products.map((product) => product.id);
  const variantIds = found.products.flatMap((product) => product.variants.map((variant) => variant.id));
  const orderIds = found.orders.map((order) => order.id);
  const poIds = found.purchaseOrders.map((order) => order.id);
  if (variantIds.length) {
    await prisma.labelQueueItem.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.receiptLine.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.saleLine.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.refundLine.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.inventoryCountLine.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.purchaseOrderLine.deleteMany({ where: { variantId: { in: variantIds } } });
  }
  if (orderIds.length) {
    await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.saleOrder.deleteMany({ where: { id: { in: orderIds } } });
  }
  if (poIds.length) {
    await prisma.receipt.deleteMany({ where: { purchaseOrderId: { in: poIds } } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: poIds } } });
  }
  if (productIds.length) await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  const supplierIds = found.suppliers.map((supplier) => supplier.id);
  if (supplierIds.length) {
    const stillUsed = await prisma.supplier.findMany({
      where: { id: { in: supplierIds }, OR: [{ products: { some: {} } }, { purchaseOrders: { some: {} } }] },
      select: { id: true },
    });
    const blocked = new Set(stillUsed.map((supplier) => supplier.id));
    const removable = supplierIds.filter((id) => !blocked.has(id));
    if (removable.length) await prisma.supplier.deleteMany({ where: { id: { in: removable } } });
  }
  const leftoverOrders = await prisma.saleOrder.count({ where: { NOT: { shopifyOrderId: { startsWith: "demo-" } }, demoSeed: false } });
  if (leftoverOrders === 0) {
    await prisma.journalEntry.deleteMany({ where: { source: "shopify" } });
  }
  const locations = await prisma.location.findMany({ include: { _count: { select: { stockLevels: true, purchaseOrders: true, counts: true } } } });
  const emptyDemoLocations = locations.filter(
    (location) => (location.demoSeed || location.name === "Sparkle & Squish online") && location._count.stockLevels === 0 && location._count.purchaseOrders === 0 && location._count.counts === 0,
  );
  if (emptyDemoLocations.length) await prisma.location.deleteMany({ where: { id: { in: emptyDemoLocations.map((location) => location.id) } } });
  await prisma.auditLog.deleteMany({ where: { action: "Sample dry run" } });
  return countDemoSeed();
}
