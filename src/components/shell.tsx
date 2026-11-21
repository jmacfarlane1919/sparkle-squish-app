"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartBar, Home, LayoutGrid, ScanBarcode, Settings } from "lucide-react";
import { logout } from "@/server/actions/auth";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/inventory", label: "Inventory", icon: LayoutGrid },
  { href: "/lookup", label: "Scan", icon: ScanBarcode },
  { href: "/sales", label: "Sales", icon: ChartBar },
];

export function Shell({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-20 border-b border-[#efe8f4] bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#e7dff8] to-[#f8d5e4] text-xs font-extrabold text-[#6d4bc3]">
              S&S
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-extrabold">S&S Software</span>
              <span className="block text-[11px] font-bold text-[#8a8496]">Sparkle & Squish</span>
            </span>
          </Link>
          <span className="flex items-center gap-1">
            <Link href="/settings" className="grid h-10 w-10 place-items-center rounded-2xl text-[#6d4bc3]" aria-label="Settings">
              <Settings className="h-5 w-5" />
            </Link>
            <form action={logout}>
              <button className="h-10 rounded-2xl px-2 text-xs font-extrabold text-[#8a8496]" type="submit">
                Log out
              </button>
            </form>
          </span>
        </div>
        {demo ? (
          <p className="border-t border-[#f6d5e3] bg-[#fff6fa] px-4 py-2 text-center text-xs font-bold text-[#8d4d68]">
            Demo shop. Shopify writes are off, and this catalog is sample data.
          </p>
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pt-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[#efe8f4] bg-white/95 backdrop-blur">
        <ul className="mx-auto grid max-w-5xl grid-cols-4">
          {items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link href={item.href} className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-extrabold ${active ? "text-[#2f6fe0]" : "text-[#8a8496]"}`}>
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
