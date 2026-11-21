"use server";

import { revalidatePath } from "next/cache";
import { importProducts, importPurchaseOrders, importSuppliers, previewOrders, previewProducts, previewSuppliers } from "@/server/csv-import";

export async function previewCsv(kind: string, csv: string) {
  if (kind === "suppliers") return previewSuppliers(csv);
  if (kind === "orders") return previewOrders(csv);
  return previewProducts(csv);
}

export async function commitCsv(kind: string, csv: string) {
  const result = kind === "suppliers" ? await importSuppliers(csv) : kind === "orders" ? await importPurchaseOrders(csv) : await importProducts(csv);
  revalidatePath("/");
  return result;
}
