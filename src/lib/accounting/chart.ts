export type AccountType = "asset" | "liability" | "equity" | "income" | "cogs" | "expense";

export type StarterAccount = {
  code: string;
  name: string;
  type: AccountType;
  contra?: boolean;
  key: string;
};

/** Starter books for a small US shop that sells on Shopify and at The Squishy Shop. */
export const STARTER_ACCOUNTS: StarterAccount[] = [
  { code: "1000", name: "Checking", type: "asset", key: "checking" },
  { code: "1010", name: "Shopify payouts clearing", type: "asset", key: "shopify_clearing" },
  { code: "1020", name: "Cash drawer — The Squishy Shop", type: "asset", key: "cash_drawer" },
  { code: "1200", name: "Inventory", type: "asset", key: "inventory" },
  { code: "1500", name: "Equipment and furniture", type: "asset", key: "fixed_assets" },
  { code: "1510", name: "Accumulated depreciation", type: "asset", contra: true, key: "accum_depr" },
  { code: "2000", name: "Credit card", type: "liability", key: "credit_card" },
  { code: "2100", name: "Sales tax payable", type: "liability", key: "sales_tax" },
  { code: "2200", name: "Supplier bills to pay", type: "liability", key: "ap" },
  { code: "2300", name: "Due to/from Jamey", type: "liability", key: "member" },
  { code: "3000", name: "Owner's equity", type: "equity", key: "equity" },
  { code: "3100", name: "Owner contributions", type: "equity", key: "contributions" },
  { code: "3200", name: "Owner draws", type: "equity", contra: true, key: "draws" },
  { code: "4000", name: "Sales", type: "income", key: "sales" },
  { code: "4100", name: "Shipping charged to customers", type: "income", key: "shipping_income" },
  { code: "4200", name: "Discounts and refunds", type: "income", contra: true, key: "discounts" },
  { code: "5000", name: "Cost of goods sold", type: "cogs", key: "cogs" },
  { code: "6100", name: "Shipping and postage", type: "expense", key: "shipping" },
  { code: "6110", name: "Packaging", type: "expense", key: "packaging" },
  { code: "6200", name: "Shopify and app fees", type: "expense", key: "shopify_fees" },
  { code: "6210", name: "Payment processing fees", type: "expense", key: "processing_fees" },
  { code: "6300", name: "Advertising", type: "expense", key: "advertising" },
  { code: "6400", name: "Supplies", type: "expense", key: "supplies" },
  { code: "6500", name: "Software subscriptions", type: "expense", key: "software" },
  { code: "6600", name: "Business filing and licenses", type: "expense", key: "filing" },
  { code: "6700", name: "Depreciation", type: "expense", key: "depreciation" },
];

export function normalSide(type: AccountType, contra = false): "debit" | "credit" {
  const debitNormal = type === "asset" || type === "cogs" || type === "expense";
  const side = debitNormal ? "debit" : "credit";
  return contra ? (side === "debit" ? "credit" : "debit") : side;
}
