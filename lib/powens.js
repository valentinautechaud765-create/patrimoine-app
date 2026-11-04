import crypto from "node:crypto";

export function powensConfig() {
  // Accepte « https://xxx.biapi.pro/2.0/ » comme « xxx.biapi.pro » : on ne garde que le domaine.
  const domain = String(process.env.POWENS_DOMAIN || "").trim().replace(/^https?:\/\//, "").split("/")[0];
  const clientId = String(process.env.POWENS_CLIENT_ID || "").trim(), secret = String(process.env.POWENS_CLIENT_SECRET || "").trim();
  if (!domain || !clientId || !secret) throw new Error("La connexion bancaire n’est pas encore configurée (Powens).");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.biapi\.pro$/i.test(domain)) throw new Error(`POWENS_DOMAIN invalide (« ${domain} ») : il doit ressembler à « monappli-sandbox.biapi.pro » (voir console Powens → Domaines).`);
  return { domain, clientId, secret, api: `https://${domain}/2.0` };
}

// Appel à l'API Powens avec des messages d'erreur compréhensibles (jamais « Unexpected token < »).
export async function powensFetch(url, options = {}) {
  let r;
  try { r = await fetch(url, { ...options, headers: { Accept: "application/json", ...(options.headers || {}) }, cache: "no-store", signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error("Powens ne répond pas pour le moment. Réessayez dans quelques minutes."); }
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch {}
  if (!j) {
    console.error("[powens] réponse non JSON", r.status, url.split("?")[0], text.slice(0, 120));
    throw new Error(r.status === 404 ? "Adresse Powens introuvable : vérifiez POWENS_DOMAIN dans Vercel (console Powens → Domaines)." : `Powens a renvoyé une réponse inattendue (code ${r.status}). Vérifiez POWENS_DOMAIN dans Vercel.`);
  }
  if (!r.ok) {
    const code = j.code || j.error || "";
    if (r.status === 401 || /invalid(Client|_client)|unauthorized|wrongpass/i.test(code + " " + (j.description || ""))) throw new Error("Identifiants Powens refusés : vérifiez POWENS_CLIENT_ID et POWENS_CLIENT_SECRET dans Vercel.");
    throw new Error(j.description || j.message || `Erreur Powens (${r.status}).`);
  }
  return j;
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
