import { LoginScreen } from "@/components/login-screen";
import { isDemoMode } from "@/lib/env";
import { resolveOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const needsSetup = !(await resolveOwner());
  const demoHint = process.env.NODE_ENV !== "production" && isDemoMode() && !process.env.OWNER_PASSWORD;
  return <LoginScreen needsSetup={needsSetup} error={params.error} next={params.next || "/"} demoHint={demoHint} />;
}
