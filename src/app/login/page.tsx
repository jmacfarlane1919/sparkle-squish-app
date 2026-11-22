import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isDemoMode } from "@/lib/env";
import { resolveOwner } from "@/lib/owner";
import { login, setupOwner } from "@/server/actions/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const owner = await resolveOwner();
  const localDemo = process.env.NODE_ENV !== "production" && isDemoMode();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#e7dff8] to-[#f8d5e4] text-sm font-extrabold text-[#6d4bc3]">
          S&S
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">S&S Software</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#8a8496]">
          The back office for Sparkle & Squish. Shopify still runs the website, the register, and checkout. This is where products, orders, and counts stay in one place.
        </p>
      </div>
      {owner ? (
        <form action={login} className="space-y-3 rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(80,60,110,0.06)]">
          {params.error ? <p className="rounded-2xl bg-[#fde8ef] px-3 py-2 text-sm font-semibold text-[#8d2d52]">{params.error}</p> : null}
          <input type="hidden" name="next" value={params.next || "/"} />
          <label className="block text-sm font-extrabold">
            Email
            <Input className="mt-1.5" name="email" type="email" autoComplete="username" defaultValue={owner.email} required />
          </label>
          <label className="block text-sm font-extrabold">
            Password
            <Input className="mt-1.5" name="password" type="password" autoComplete="current-password" defaultValue={localDemo && owner.source === "env" ? owner.password : ""} required />
          </label>
          <Button className="w-full" type="submit">
            Sign in
          </Button>
          {localDemo ? <p className="text-xs leading-relaxed text-[#8a8496]">Demo sign-in is filled in. The password is squish-demo.</p> : null}
        </form>
      ) : (
        <form action={setupOwner} className="space-y-3 rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(80,60,110,0.06)]">
          {params.error ? <p className="rounded-2xl bg-[#fde8ef] px-3 py-2 text-sm font-semibold text-[#8d2d52]">{params.error}</p> : null}
          <p className="text-sm text-[#8a8496]">This is the first time the live site has been opened. Choose the email and password you will use from now on. The demo password will not work here.</p>
          <label className="block text-sm font-extrabold">
            Email
            <Input className="mt-1.5" name="email" type="email" autoComplete="username" required />
          </label>
          <label className="block text-sm font-extrabold">
            Password
            <Input className="mt-1.5" name="password" type="password" autoComplete="new-password" minLength={10} required />
          </label>
          <label className="block text-sm font-extrabold">
            Password again
            <Input className="mt-1.5" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
          </label>
          <Button className="w-full" type="submit">
            Save and sign in
          </Button>
        </form>
      )}
    </main>
  );
}
