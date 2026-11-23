/** Small reads. Nested connections are separate queries so none of these can reach Shopify's 1000-point cap. */

export const PRODUCTS_COUNT_QUERY = `query ProductCount($search: String) {
  productsCount(query: $search) { count }
}`;

export const PRODUCT_SHELLS_QUERY = `query ProductShells($cursor: String, $search: String) {
  products(first: 8, after: $cursor, query: $search) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      description
      status
      vendor
      brand: metafield(namespace: "custom", key: "brand") { value }
      texture: metafield(namespace: "custom", key: "texture") { value }
      season: metafield(namespace: "custom", key: "season") { value }
      size: metafield(namespace: "custom", key: "size") { value }
      material: metafield(namespace: "custom", key: "material") { value }
      ageGuidance: metafield(namespace: "custom", key: "age_guidance") { value }
      newArrival: metafield(namespace: "custom", key: "new_arrival") { value }
      receivedAt: metafield(namespace: "custom", key: "received_at") { value }
    }
  }
}`;

export const VARIANTS_QUERY = `query ProductVariants($id: ID!, $cursor: String) {
  product(id: $id) {
    variants(first: 15, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        sku
        barcode
        price
        inventoryItem { id unitCost { amount } }
        ssSku: metafield(namespace: "custom", key: "s_s_sku") { value }
        ssBarcode: metafield(namespace: "custom", key: "s_s_barcode") { value }
        barcodes(first: 5) { nodes { value } }
      }
    }
  }
}`;

export const INVENTORY_QUERY = `query InventoryBatch($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on InventoryItem {
      id
      inventoryLevels(first: 8) {
        nodes {
          location { id name }
          quantities(names: ["available"]) { name quantity }
        }
      }
    }
  }
}`;

export const ORDERS_COUNT_QUERY = `query OrderCount($search: String) {
  ordersCount(query: $search) { count }
}`;

export const ORDERS_QUERY = `query ImportOrders($cursor: String, $search: String) {
  orders(first: 5, after: $cursor, query: $search, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      sourceName
      processedAt
      displayFinancialStatus
      cancelledAt
      retailLocation { id name }
      lineItems(first: 8) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          title
          sku
          quantity
          originalUnitPriceSet { shopMoney { amount } }
          variant { id }
        }
      }
      refunds {
        id
        createdAt
        refundLineItems(first: 5) {
          nodes {
            quantity
            subtotalSet { shopMoney { amount } }
            lineItem { id title sku variant { id } }
          }
        }
      }
    }
  }
}`;

export const ORDER_LINES_QUERY = `query OrderLines($id: ID!, $cursor: String) {
  order(id: $id) {
    lineItems(first: 8, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        sku
        quantity
        originalUnitPriceSet { shopMoney { amount } }
        variant { id }
      }
    }
  }
}`;

export const LOCATIONS_QUERY = `query ShopLocations($cursor: String) {
  locations(first: 20, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { id name isActive }
  }
}`;

export const IMPORT_QUERIES = [
  PRODUCTS_COUNT_QUERY,
  PRODUCT_SHELLS_QUERY,
  VARIANTS_QUERY,
  INVENTORY_QUERY,
  ORDERS_COUNT_QUERY,
  ORDERS_QUERY,
  ORDER_LINES_QUERY,
  LOCATIONS_QUERY,
];

/** Conservative stand-in for Shopify's pre-flight cost: a connection multiplies by its first: argument. */
export function estimatedQueryCost(query: string) {
  let index = query.indexOf("{");
  if (index < 0) return 0;
  index += 1;

  function skipSpace() {
    while (index < query.length && /\s/.test(query[index])) index += 1;
  }

  function selection(): number {
    let cost = 0;
    while (index < query.length) {
      skipSpace();
      if (index >= query.length) return cost;
      if (query[index] === "}") {
        index += 1;
        return cost;
      }
      if (query[index] === ".") {
        while (index < query.length && query[index] !== "{") index += 1;
        continue;
      }
      const nameStart = index;
      while (index < query.length && /[A-Za-z0-9_]/.test(query[index])) index += 1;
      const name = query.slice(nameStart, index);
      if (!name) {
        index += 1;
        continue;
      }
      skipSpace();
      let first = 0;
      if (query[index] === "(") {
        const end = query.indexOf(")", index);
        const args = query.slice(index, end === -1 ? query.length : end);
        const match = args.match(/first:\s*(\d+)/);
        if (match) first = Number(match[1]);
        index = end === -1 ? query.length : end + 1;
        skipSpace();
      }
      if (query[index] === "{") {
        index += 1;
        const inner = selection();
        cost += first > 0 ? first * Math.max(inner, 1) : Math.max(inner, 1);
      } else {
        cost += 1;
      }
    }
    return cost;
  }

  return selection();
}
