import { PageIntro, Shown } from "@/components/bits";
import { prisma } from "@/lib/db";
import { formatWhen } from "@/lib/format";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 80 });
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Audit log" subtitle="Every Shopify write is recorded here, including dry runs and writes that were blocked because a switch was off." />
      <div className="space-y-2">
        {entries.map((entry) => (
          <details key={entry.id} className="rounded-[22px] bg-white p-4">
            <summary className="cursor-pointer">
              <span className="font-extrabold">{entry.action}</span>
              <span className="mt-1 block text-xs text-[#8a8496]">{formatWhen(entry.createdAt)} · {entry.feature} · {entry.mode}</span>
            </summary>
            <p className="mt-3 text-sm"><Shown value={entry.summary} /></p>
            <p className="mt-2 text-sm text-[#8a8496]"><Shown value={entry.result} /></p>
            {entry.payload ? <pre className="mt-3 overflow-x-auto text-[11px]"><Shown value={entry.payload} /></pre> : null}
          </details>
        ))}
      </div>
    </div>
  );
}
