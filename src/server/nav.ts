import { redirect } from "next/navigation";

export function go(path: string, message?: { notice?: string; error?: string }): never {
  const url = new URL(path, "http://ss.local");
  if (message?.notice) url.searchParams.set("notice", message.notice);
  if (message?.error) url.searchParams.set("error", message.error);
  redirect(`${url.pathname}${url.search}`);
}

export function safeNext(value: FormDataEntryValue | null) {
  const next = String(value || "/");
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) return "/";
  return next;
}
