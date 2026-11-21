const FORBIDDEN_KEYS = new Set(["sku", "barcode", "barcodes"]);
const FORBIDDEN_QUERY = /\b(sku|barcode|barcodes)\s*:/;

export type ShopifyOperation = {
  name: string;
  query: string;
  variables: Record<string, unknown>;
};

export function assertPayloadSafe(operation: ShopifyOperation) {
  if (FORBIDDEN_QUERY.test(operation.query)) {
    throw new Error(`Refusing Shopify write ${operation.name}: the query sets a native identifier field.`);
  }
  walk(operation.variables, "$");
}

function walk(value: unknown, path: string) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`Refusing to write native identifier field ${path}.${key}`);
    }
    walk(child, `${path}.${key}`);
  }
}

export function shopifyOperation(name: string, query: string, variables: Record<string, unknown>): ShopifyOperation {
  const operation = { name, query, variables };
  assertPayloadSafe(operation);
  return operation;
}

export function collectUserErrors(data: unknown) {
  const messages: string[] = [];
  walkErrors(data);
  return messages;

  function walkErrors(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walkErrors);
      return;
    }
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.userErrors)) {
      for (const error of record.userErrors) {
        if (error && typeof error === "object" && "message" in error) {
          messages.push(String((error as { message: unknown }).message));
        }
      }
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== "userErrors") walkErrors(child);
    }
  }
}
