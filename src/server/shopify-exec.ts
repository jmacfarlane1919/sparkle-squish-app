import { shopifyConfigured } from "@/lib/env";
import type { FeatureKey } from "@/lib/features";
import { prisma } from "@/lib/db";
import type { ShopifyOperation } from "@/lib/shopify/guard";
import { runShopifyOperation } from "@/lib/shopify/client";
import { recordAudit } from "@/server/audit";

export type WriteMode = "blocked" | "dry_run" | "live" | "error";

export async function featureEnabled(feature: FeatureKey) {
  const flag = await prisma.featureFlag.findUnique({ where: { key: feature } });
  return flag?.enabled ?? false;
}

export async function executeFeature(feature: FeatureKey, action: string, summary: string, operations: ShopifyOperation[]) {
  const payload = JSON.stringify(operations, null, 2);
  if (!operations.length) {
    await recordAudit({ feature, action, mode: "dry_run", summary, payload, result: "Nothing to send." });
    return { mode: "dry_run" as const, result: "Nothing to send." };
  }
  if (!(await featureEnabled(feature))) {
    const result = "The switch is off, so nothing was sent to Shopify.";
    await recordAudit({ feature, action, mode: "blocked", summary, payload, result });
    return { mode: "blocked" as const, result };
  }
  if (!shopifyConfigured()) {
    const result = "Demo mode: the Shopify token is not set, so this stayed a dry run.";
    await recordAudit({ feature, action, mode: "dry_run", summary, payload, result });
    return { mode: "dry_run" as const, result };
  }
  try {
    const results = [];
    for (const operation of operations) results.push(await runShopifyOperation(operation));
    const result = JSON.stringify(results);
    await recordAudit({ feature, action, mode: "live", summary, payload, result });
    return { mode: "live" as const, result };
  } catch (error) {
    const result = error instanceof Error ? error.message : "Shopify rejected the write.";
    await recordAudit({ feature, action, mode: "error", summary, payload, result });
    return { mode: "error" as const, result };
  }
}
