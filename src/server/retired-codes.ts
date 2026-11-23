import { prisma } from "@/lib/db";

const KEY = "retired_codes";

export async function retiredCodes() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return { skus: [] as string[], barcodes: [] as string[] };
  try {
    const parsed = JSON.parse(row.value) as { skus?: string[]; barcodes?: string[] };
    return { skus: parsed.skus || [], barcodes: parsed.barcodes || [] };
  } catch {
    return { skus: [] as string[], barcodes: [] as string[] };
  }
}

export async function rememberRetired(skus: string[], barcodes: string[]) {
  const current = await retiredCodes();
  const next = {
    skus: [...new Set([...current.skus, ...skus.map((sku) => sku.trim().toUpperCase()).filter(Boolean)])],
    barcodes: [...new Set([...current.barcodes, ...barcodes.map((code) => code.trim()).filter(Boolean)])],
  };
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
}
