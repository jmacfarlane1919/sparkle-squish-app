import { Shell } from "@/components/shell";
import { shopifyConfigured, shouldLoadDemo } from "@/lib/env";
import { ensureDemoSeed } from "@/server/seed-demo";

export const dynamic = "force-dynamic";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  await ensureDemoSeed();
  const banner = shouldLoadDemo() ? "demo" : shopifyConfigured() ? null : "shopify";
  return <Shell banner={banner}>{children}</Shell>;
}
