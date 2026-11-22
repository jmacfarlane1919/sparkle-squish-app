import crypto from "node:crypto";
import { prisma } from "@/lib/db";

export const DEMO_OWNER_EMAIL = "owner@sparklesquish.shop";
export const DEMO_OWNER_PASSWORD = "squish-demo";

const EMAIL_KEY = "owner_email";
const PASSWORD_KEY = "owner_password_hash";

export type OwnerRecord =
  | { email: string; password: string; source: "env" }
  | { email: string; passwordHash: string; source: "database" };

/** A live-site password has to be chosen. The demo password never works in production. */
export function productionPasswordAllowed(password: string) {
  return password.length >= 10 && password !== DEMO_OWNER_PASSWORD;
}

export function hashOwnerPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyStoredPassword(password: string, stored: string) {
  const [kind, salt, hash] = stored.split(":");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function passwordMatchesOwner(password: string, owner: OwnerRecord) {
  if (owner.source === "database") return verifyStoredPassword(password, owner.passwordHash);
  return timingEqualText(password, owner.password);
}

function timingEqualText(input: string, expected: string) {
  if (!expected) return false;
  const left = crypto.createHash("sha256").update(input).digest();
  const right = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(left, right);
}

/**
 * Local demo uses the sample sign-in when no password is set.
 * Production uses OWNER_EMAIL and OWNER_PASSWORD, or the owner saved on first open.
 */
export async function resolveOwner(): Promise<OwnerRecord | null> {
  const email = process.env.OWNER_EMAIL?.trim() || "";
  const password = process.env.OWNER_PASSWORD || "";
  if (process.env.NODE_ENV !== "production") {
    return { email: email || DEMO_OWNER_EMAIL, password: password || DEMO_OWNER_PASSWORD, source: "env" };
  }
  if (email && productionPasswordAllowed(password)) return { email, password, source: "env" };
  const [storedEmail, storedHash] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: EMAIL_KEY } }),
    prisma.appSetting.findUnique({ where: { key: PASSWORD_KEY } }),
  ]);
  if (storedEmail?.value && storedHash?.value) {
    return { email: storedEmail.value, passwordHash: storedHash.value, source: "database" };
  }
  return null;
}

export async function isOwnerEmail(email: string) {
  const owner = await resolveOwner();
  return Boolean(owner && email.trim().toLowerCase() === owner.email.toLowerCase());
}

export async function saveFirstOwner(email: string, password: string) {
  const hash = hashOwnerPassword(password);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.appSetting.findUnique({ where: { key: PASSWORD_KEY } });
    if (existing) throw new Error("An owner is already set.");
    await tx.appSetting.create({ data: { key: EMAIL_KEY, value: email } });
    await tx.appSetting.create({ data: { key: PASSWORD_KEY, value: hash } });
  });
}
