import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key() {
  const k = Buffer.from(process.env.OAUTH_ENCRYPTION_KEY || "", "base64");
  if (k.length !== 32) throw new Error("OAUTH_ENCRYPTION_KEY_REQUIRED");
  return k;
}
export function encrypt(value: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    bytes.toString("base64url"),
  ].join(".");
}
export function decrypt(value: string, context: string) {
  const [version, iv, tag, bytes] = value.split(".");
  if (version !== "v1" || !iv || !tag || !bytes)
    throw new Error("INVALID_CIPHERTEXT");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    cipher.update(Buffer.from(bytes, "base64url")),
    cipher.final(),
  ]).toString("utf8");
}
