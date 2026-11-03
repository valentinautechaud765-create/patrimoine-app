import crypto from "node:crypto";

export function powensConfig() {
  const domain = String(process.env.POWENS_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const clientId = process.env.POWENS_CLIENT_ID, secret = process.env.POWENS_CLIENT_SECRET;
  if (!domain || !clientId || !secret) throw new Error("La connexion bancaire n’est pas encore configurée (Powens).");
  return { domain, clientId, secret, api: `https://${domain}/2.0` };
}
// Jeton Powens chiffré avant d'être stocké (AES-256-GCM, clé dérivée du secret serveur).
const key = () => crypto.createHash("sha256").update(String(process.env.POWENS_CLIENT_SECRET || "") + "|" + String(process.env.SUPABASE_SERVICE_ROLE_KEY || "")).digest();
export function encrypt(text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString("base64")).join(".");
}
export function decrypt(value) {
  const [iv, tag, data] = String(value).split(".").map(s => Buffer.from(s, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
