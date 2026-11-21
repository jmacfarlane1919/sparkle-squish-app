"use server";

import { ownerMatches, clearSessionCookie, setSessionCookie, signSession } from "@/lib/auth";
import { go, safeNext } from "@/server/nav";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const next = safeNext(formData.get("next"));
  if (!ownerMatches(email, password)) {
    go(`/login?next=${encodeURIComponent(next)}`, {
      error: "That email or password does not match the owner sign-in.",
    });
  }
  await setSessionCookie(await signSession(email.trim().toLowerCase()));
  go(next);
}

export async function logout() {
  await clearSessionCookie();
  go("/login");
}
