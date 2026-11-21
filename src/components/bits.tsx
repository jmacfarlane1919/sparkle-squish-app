import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

export function Notice({ notice, error }: { notice?: string; error?: string }) {
  if (error) return <p className="mb-4 rounded-2xl bg-[#fde8ef] px-4 py-3 text-sm font-semibold text-[#8d2d52]">{error}</p>;
  if (notice) return <p className="mb-4 rounded-2xl bg-[#e5f6f2] px-4 py-3 text-sm font-semibold text-[#14685a]">{notice}</p>;
  return null;
}

export function PageIntro({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-[1.7rem] font-extrabold leading-tight tracking-tight text-[#2c2640]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-xl text-sm leading-snug text-[#8a8496]">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-extrabold text-[#2c2640]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs leading-snug text-[#8a8496]">{hint}</span> : null}
    </label>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(80,60,110,0.06)] ${className}`}>{children}</section>;
}

const tones = ["#f8d5e4", "#e7dff8", "#d4f1ea", "#d9e7fb", "#fde4c4", "#f0d9f6"];

export function Monogram({ name, className = "" }: { name: string; className?: string }) {
  const color = tones[name.length % tones.length];
  return (
    <span className={`grid place-items-center rounded-2xl font-extrabold text-[#2c2640] ${className}`} style={{ background: color }}>
      {name.trim().charAt(0).toUpperCase() || "S"}
    </span>
  );
}

export function HubCard({
  href,
  title,
  description,
  icon: Icon,
  tile,
  ink,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tile: string;
  ink: string;
  badge?: string;
}) {
  return (
    <Link href={href} className="flex min-h-36 flex-col justify-between rounded-[22px] bg-white p-3.5 shadow-[0_8px_24px_rgba(80,60,110,0.06)]">
      <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: tile, color: ink }}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="mt-3 flex items-end justify-between gap-2">
        <span>
          <span className="block text-[15px] font-extrabold leading-tight text-[#2f6fe0]">{title}</span>
          <span className="mt-1 block text-[12px] leading-snug text-[#8a8496]">{description}</span>
          {badge ? <span className="mt-2 inline-flex rounded-full bg-[#f8d5e4] px-2 py-0.5 text-[10px] font-extrabold text-[#a24bb5]">{badge}</span> : null}
        </span>
        <ChevronRight className="mb-0.5 h-4 w-4 shrink-0 text-[#c5bfd2]" />
      </span>
    </Link>
  );
}

export function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white px-2 py-3 text-center shadow-[0_8px_24px_rgba(80,60,110,0.05)]">
      <div className="text-2xl font-extrabold text-[#2c2640]">{value}</div>
      <div className="mt-1 text-[11px] font-bold leading-tight text-[#8a8496]">{label}</div>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-3 inline-flex text-sm font-extrabold text-[#2f6fe0]">
      {children}
    </Link>
  );
}
