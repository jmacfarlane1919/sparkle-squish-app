export const FEATURES = [
  {
    key: "product_basics",
    label: "Product details, price, and S&S identifiers",
    description:
      "Sends the title, description, price, and custom metafields, including the S&S SKU and barcode. It never writes Shopify's SKU or barcode fields.",
  },
  {
    key: "product_photos",
    label: "S&S branded photos",
    description: "Uploads branded photos with fileCreate or fileUpdate. Original photos stay in this app.",
  },
  {
    key: "receive_stock",
    label: "Receiving adds stock",
    description: "Adds the received quantity with inventoryAdjustQuantities. It never sets a replacement count.",
  },
  {
    key: "receive_cost",
    label: "Receiving updates unit cost",
    description: "Sets the inventory item's unit cost to the weighted average.",
  },
  {
    key: "cycle_count",
    label: "Cycle count sets quantity",
    description: "Sets an absolute quantity only when that item had no sales during the count.",
  },
  {
    key: "webhooks",
    label: "Register Shopify webhooks",
    description: "Creates the order, refund, product, and inventory webhook subscriptions.",
  },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
