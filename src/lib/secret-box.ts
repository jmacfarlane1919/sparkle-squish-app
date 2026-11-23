import crypto from "node:crypto";

function key(secret: string) {
  return crypto.createHash("sha256").update(secret).digest();
}

/** AES-256-GCM. The packed string is iv.tag.ciphertext and does not contain the plaintext. */
export function sealSecret(plain: string, secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function openSecret(packed: string, secret: string) {
  const [iv, tag, data] = packed.split(".");
  if (!iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
