import { unstable_rethrow } from "next/navigation";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

/** Redirects and not-found are control flow. Call this at the start of every catch. */
export function rethrowNavigation(error: unknown): void {
  if (isRedirectError(error)) throw error;
  unstable_rethrow(error);
}

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
