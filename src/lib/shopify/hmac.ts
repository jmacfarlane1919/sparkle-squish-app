import crypto from "node:crypto";

export function verifyShopifyWebhook(rawBody: string | Buffer, header: string | null, secret: string) {
  if (!header || !secret) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const expected = Buffer.from(digest);
  const provided = Buffer.from(header);
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}
