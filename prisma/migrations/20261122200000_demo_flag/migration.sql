-- Marks sample-shop rows so they can be removed without touching a real catalog.
ALTER TABLE "Location" ADD COLUMN "demoSeed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Supplier" ADD COLUMN "demoSeed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "demoSeed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PurchaseOrder" ADD COLUMN "demoSeed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SaleOrder" ADD COLUMN "demoSeed" BOOLEAN NOT NULL DEFAULT false;
