export const PRODUCTS_QUERY = `query ImportProducts($cursor: String, $search: String) {
  products(first: 25, after: $cursor, query: $search) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      description
      status
      vendor
      variants(first: 100) {
        nodes {
          id
          title
          sku
          barcode
          price
          inventoryItem {
            id
            unitCost { amount }
            inventoryLevels(first: 20) {
              nodes {
                location { id name }
                quantities(names: ["available"]) { name quantity }
              }
            }
          }
          ssSku: metafield(namespace: "custom", key: "s_s_sku") { value }
          ssBarcode: metafield(namespace: "custom", key: "s_s_barcode") { value }
          barcodes(first: 20) { nodes { value } }
        }
      }
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

export const ORDERS_QUERY = `query ImportOrders($cursor: String, $search: String) {
  orders(first: 40, after: $cursor, query: $search, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      sourceName
      processedAt
      displayFinancialStatus
      cancelledAt
      retailLocation { id name }
      lineItems(first: 100) {
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
        refundLineItems(first: 50) {
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

export const LOCATIONS_QUERY = `query ShopLocations {
  locations(first: 20) {
    nodes { id name isActive }
  }
}`;
