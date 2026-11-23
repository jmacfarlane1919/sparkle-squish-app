-- Incoming purchase-order lines can exist before a product is in the catalog.
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "supplierSku" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "unitCostPrecise" INTEGER;
