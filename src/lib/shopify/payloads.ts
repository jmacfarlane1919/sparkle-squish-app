import { shopifyOperation, type ShopifyOperation } from "@/lib/shopify/guard";

export type VariantWriteInput = {
  shopifyVariantId: string | null;
  priceCents: number;
  vendorSku: string;
  vendorBarcode: string;
  ssSku: string;
  ssBarcode: string;
  title: string;
};

export type ProductWriteInput = {
  shopifyProductId: string | null;
  title: string;
  description: string;
  status: "active" | "draft" | "archived";
  brand: string;
  texture: string;
  season: string;
  size: string;
  material: string;
  ageGuidance: string;
  newArrival: boolean;
  receivedAt: string | null;
  variants: VariantWriteInput[];
};

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

function metafield(ownerId: string, key: string, type: string, value: string) {
  return { ownerId, namespace: "custom", key, type, value };
}

const PRODUCT_SET = `mutation productSet($input: ProductSetInput!) {
  productSet(input: $input) {
    product { id title variants(first: 20) { nodes { id inventoryItem { id } } } }
    userErrors { field message code }
  }
}`;

const VARIANT_PRICE = `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id price }
    userErrors { field message }
  }
}`;

const METAFIELDS = `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { namespace key value }
    userErrors { field message code }
  }
}`;

export function buildProductBasicsOperations(input: ProductWriteInput): ShopifyOperation[] {
  const operations: ShopifyOperation[] = [];
  const status = input.status.toUpperCase();

  if (!input.shopifyProductId) {
    operations.push(
      shopifyOperation("productSet", PRODUCT_SET, {
        input: {
          title: input.title,
          descriptionHtml: input.description,
          status,
          productOptions: [
            {
              name: "Title",
              values: input.variants.map((variant) => ({ name: variant.title || "Default Title" })),
            },
          ],
          variants: input.variants.map((variant) => ({
            optionValues: [{ optionName: "Title", name: variant.title || "Default Title" }],
            price: money(variant.priceCents),
          })),
        },
      }),
    );
  } else {
    operations.push(
      shopifyOperation("productSet", PRODUCT_SET, {
        input: {
          id: input.shopifyProductId,
          title: input.title,
          descriptionHtml: input.description,
          status,
        },
      }),
    );
    const priced = input.variants.filter((variant) => variant.shopifyVariantId);
    if (priced.length) {
      operations.push(
        shopifyOperation("productVariantsBulkUpdate", VARIANT_PRICE, {
          productId: input.shopifyProductId,
          variants: priced.map((variant) => ({
            id: variant.shopifyVariantId,
            price: money(variant.priceCents),
          })),
        }),
      );
    }
  }

  const productOwner = input.shopifyProductId ?? "gid://shopify/Product/NEW";
  const metafields: ReturnType<typeof metafield>[] = [];
  const productFields: [string, string, string][] = [
    ["brand", "single_line_text_field", input.brand],
    ["texture", "single_line_text_field", input.texture],
    ["season", "single_line_text_field", input.season],
    ["size", "single_line_text_field", input.size],
    ["material", "single_line_text_field", input.material],
    ["age_guidance", "single_line_text_field", input.ageGuidance],
    ["new_arrival", "boolean", input.newArrival ? "true" : "false"],
  ];
  if (input.receivedAt) productFields.push(["received_at", "date", input.receivedAt]);
  for (const [key, type, value] of productFields) {
    if (value !== "") metafields.push(metafield(productOwner, key, type, value));
  }
  for (const variant of input.variants) {
    const owner = variant.shopifyVariantId ?? "gid://shopify/ProductVariant/NEW";
    if (variant.ssSku) metafields.push(metafield(owner, "s_s_sku", "single_line_text_field", variant.ssSku));
    if (variant.ssBarcode) metafields.push(metafield(owner, "s_s_barcode", "single_line_text_field", variant.ssBarcode));
  }
  if (metafields.length) {
    operations.push(shopifyOperation("metafieldsSet", METAFIELDS, { metafields }));
  }
  return operations;
}

export function describeProductWrite(input: ProductWriteInput) {
  const prices = input.variants.map((variant) => `${variant.title || "Variant"} at ${money(variant.priceCents)}`);
  const identifiers = input.variants.flatMap((variant) => {
    const parts = [];
    if (variant.ssSku) parts.push(`custom.s_s_sku = ${variant.ssSku}`);
    if (variant.ssBarcode) parts.push(`custom.s_s_barcode = ${variant.ssBarcode}`);
    return parts;
  });
  return `Shopify would receive the title “${input.title}”, ${prices.join(", ")}, and ${identifiers.join(", ") || "no S&S identifiers yet"}. Vendor SKUs and vendor barcodes are not in the write.`;
}

export function buildReceiveStockOperation(args: {
  delta: number;
  inventoryItemId: string;
  locationId: string;
  referenceDocumentUri: string;
  idempotencyKey: string;
}) {
  if (!Number.isInteger(args.delta) || args.delta === 0) {
    throw new Error("A receive adjustment needs a non-zero whole-number delta.");
  }
  return shopifyOperation(
    "inventoryAdjustQuantities",
    `mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!, $idempotencyKey: String!) {
      inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {
        inventoryAdjustmentGroup { reason changes { name delta } }
        userErrors { field message code }
      }
    }`,
    {
      idempotencyKey: args.idempotencyKey,
      input: {
        reason: "received",
        name: "available",
        referenceDocumentUri: args.referenceDocumentUri,
        changes: [
          {
            delta: args.delta,
            inventoryItemId: args.inventoryItemId,
            locationId: args.locationId,
          },
        ],
      },
    },
  );
}

export function buildReceiveCostOperation(args: { inventoryItemId: string; costCents: number }) {
  return shopifyOperation(
    "inventoryItemUpdate",
    `mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem { id unitCost { amount } }
        userErrors { field message }
      }
    }`,
    {
      id: args.inventoryItemId,
      input: { cost: money(args.costCents) },
    },
  );
}

export function buildCycleCountSetOperation(args: {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  changeFromQuantity: number;
  referenceDocumentUri: string;
  idempotencyKey: string;
}) {
  return shopifyOperation(
    "inventorySetQuantities",
    `mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
      inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
        inventoryAdjustmentGroup { reason changes { name delta quantityAfterChange } }
        userErrors { code field message }
      }
    }`,
    {
      idempotencyKey: args.idempotencyKey,
      input: {
        name: "available",
        reason: "correction",
        referenceDocumentUri: args.referenceDocumentUri,
        quantities: [
          {
            inventoryItemId: args.inventoryItemId,
            locationId: args.locationId,
            quantity: args.quantity,
            changeFromQuantity: args.changeFromQuantity,
          },
        ],
      },
    },
  );
}

export function buildBrandedPhotoOperations(args: {
  filename: string;
  mimeType: string;
  alt: string;
  existingFileId: string | null;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
}) {
  const staged = shopifyOperation(
    "stagedUploadsCreate",
    `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          filename: args.filename,
          mimeType: args.mimeType,
          resource: "IMAGE",
          httpMethod: "POST",
        },
      ],
    },
  );
  const fileOperation = args.existingFileId
    ? shopifyOperation(
        "fileUpdate",
        `mutation fileUpdate($files: [FileUpdateInput!]!) {
          fileUpdate(files: $files) {
            files { id fileStatus alt }
            userErrors { field message code }
          }
        }`,
        { files: [{ id: args.existingFileId, alt: args.alt, originalSource: "STAGED_RESOURCE_URL" }] },
      )
    : shopifyOperation(
        "fileCreate",
        `mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files { id fileStatus alt }
            userErrors { field message code }
          }
        }`,
        {
          files: [
            {
              alt: args.alt,
              contentType: "IMAGE",
              filename: args.filename,
              originalSource: "STAGED_RESOURCE_URL",
            },
          ],
        },
      );
  const operations = [staged, fileOperation];
  if (args.shopifyProductId && args.shopifyVariantId) {
    operations.push(
      shopifyOperation(
        "productVariantsBulkUpdate",
        `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $media: [CreateMediaInput!]) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants, media: $media) {
            product { id }
            userErrors { field message }
          }
        }`,
        {
          productId: args.shopifyProductId,
          variants: [{ id: args.shopifyVariantId }],
          media: [{ originalSource: "STAGED_RESOURCE_URL", alt: args.alt, mediaContentType: "IMAGE" }],
        },
      ),
    );
  }
  return operations;
}

export const WEBHOOK_TOPICS = [
  "ORDERS_CREATE",
  "ORDERS_PAID",
  "REFUNDS_CREATE",
  "PRODUCTS_UPDATE",
  "INVENTORY_LEVELS_UPDATE",
] as const;

export function buildWebhookOperations(appUrl: string) {
  const uri = `${appUrl.replace(/\/$/, "")}/api/webhooks/shopify`;
  return WEBHOOK_TOPICS.map((topic) =>
    shopifyOperation(
      "webhookSubscriptionCreate",
      `mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription { id topic uri }
          userErrors { field message }
        }
      }`,
      { topic, webhookSubscription: { uri } },
    ),
  );
}
