import { Shell } from "@/components/shell";
import { isDemoMode } from "@/lib/env";
import { ensureDemoSeed } from "@/server/seed-demo";

export const dynamic = "force-dynamic";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  await ensureDemoSeed();
  return <Shell demo={isDemoMode()}>{children}</Shell>;
}
