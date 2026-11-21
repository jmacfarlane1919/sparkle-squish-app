import { prisma } from "@/lib/db";

export async function recordAudit(entry: {
  feature: string;
  action: string;
  mode: string;
  summary: string;
  payload?: string;
  result?: string;
}) {
  return prisma.auditLog.create({
    data: {
      feature: entry.feature,
      action: entry.action,
      mode: entry.mode,
      summary: entry.summary,
      payload: entry.payload ?? "",
      result: entry.result ?? "",
    },
  });
}
