export const SHOP = {
  name: "Sparkle & Squish",
  software: "S&S Software",
  publicUrl: "https://sparklesquishshop.com",
  domain: "mw4ti4-tj.myshopify.com",
  currency: "USD",
  timezone: "America/Chicago",
  posLocation: "The Squishy Shop",
  apiVersion: process.env.SHOPIFY_API_VERSION || "2026-10",
};

export function shopifyDomain() {
  return (process.env.SHOPIFY_STORE_DOMAIN || SHOP.domain).replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function shopifyConfigured() {
  return Boolean(process.env.SHOPIFY_ADMIN_TOKEN && shopifyDomain());
}

export function isDemoMode() {
  return !shopifyConfigured();
}

/** Sample products load only for a local demo, or when DEMO_MODE=true. A live site stays empty. */
export function shouldLoadDemo() {
  if (process.env.DEMO_MODE === "true") return true;
  if (process.env.DEMO_MODE === "false") return false;
  if (process.env.VERCEL === "1") return false;
  return process.env.NODE_ENV !== "production";
}

export function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length >= 24) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be a random string of at least 24 characters in production.");
  }
  return "dev-only-ss-software-session-secret";
}

export function getOwnerCredentials() {
  const email = process.env.OWNER_EMAIL || "owner@sparklesquish.shop";
  let password = process.env.OWNER_PASSWORD || "";
  if (!password && process.env.NODE_ENV !== "production") password = "squish-demo";
  return { email, password };
}

export function getAppUrl() {
  return (process.env.APP_URL || "http://127.0.0.1:43123").replace(/\/$/, "");
}

export function s3Configured() {
  return Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}
