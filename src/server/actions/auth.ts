"use server";

import { clearSessionCookie, setSessionCookie, signSession } from "@/lib/auth";
import { passwordMatchesOwner, productionPasswordAllowed, resolveOwner, saveFirstOwner } from "@/lib/owner";
import { go, rethrowNavigation, safeNext } from "@/server/nav";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const next = safeNext(formData.get("next"));
  const owner = await resolveOwner();
  const matches = Boolean(owner && email.trim().toLowerCase() === owner.email.toLowerCase() && passwordMatchesOwner(password, owner));
  if (!matches) {
    go(`/login?next=${encodeURIComponent(next)}`, {
      error: "That email or password does not match the owner sign-in.",
    });
  }
  await setSessionCookie(await signSession(email.trim().toLowerCase()));
  go(next);
}

export async function setupOwner(formData: FormData) {
  if (await resolveOwner()) go("/login", { error: "An owner is already set. Sign in instead." });
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    go("/login", { error: "Use a real email address." });
  }
  if (!productionPasswordAllowed(password)) {
    go("/login", { error: "Use a password of at least 10 characters. The demo password is not allowed on the live site." });
  }
  if (password !== confirm) go("/login", { error: "Those passwords do not match." });
  try {
    await saveFirstOwner(email, password);
  } catch (error) {
    rethrowNavigation(error);
    go("/login", { error: "An owner was just saved. Sign in with that email and password." });
  }
  await setSessionCookie(await signSession(email));
  go("/");
}

export async function logout() {
  await clearSessionCookie();
  go("/login");
}
