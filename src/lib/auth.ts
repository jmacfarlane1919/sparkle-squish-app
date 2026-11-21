import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getOwnerCredentials, getSessionSecret } from "@/lib/env";

export const SESSION_COOKIE = "ss_session";

function secretKey() {
  return new TextEncoder().encode(getSessionSecret());
}

export function passwordsMatch(input: string, expected: string) {
  if (!expected) return false;
  const left = crypto.createHash("sha256").update(input).digest();
  const right = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(left, right);
}

export async function signSession(email: string) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function readSessionToken(token: string) {
  const { payload } = await jwtVerify(token, secretKey());
  const email = String(payload.email || payload.sub || "");
  if (!email) throw new Error("Missing session");
  return { email };
}

export async function getSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await readSessionToken(token);
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export function ownerMatches(email: string, password: string) {
  const owner = getOwnerCredentials();
  return email.trim().toLowerCase() === owner.email.toLowerCase() && passwordsMatch(password, owner.password);
}
