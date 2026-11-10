// Paiement par virement bancaire direct sur le compte de Valentin (sans Stripe ni Lemon Squeezy).
// Chaque client a un code unique à mettre en motif du virement. Patrimo lit le compte bancaire du propriétaire
// (déjà synchronisé via Powens), retrouve les virements reçus portant ce code et en déduit l'accès :
//   7,99 € → Plus 1 mois · 66,99 € → Plus 1 an · 14,99 € → Pro 1 mois · 124,99 € → Pro 1 an.
// Plusieurs virements s'additionnent (chaque virement prolonge l'accès). Rien n'est stocké en plus :
// le calcul est refait à partir des virements reçus à chaque vérification.
//
// Variables sur Vercel : PAIEMENT_IBAN (IBAN du compte synchronisé dans Patrimo), PAIEMENT_TITULAIRE (nom du titulaire),
// et facultatif PAIEMENT_BIC.
import crypto from "node:crypto";
import { OWNER_EMAILS, PLANS } from "./config.js";
import { powensConfig, powensFetch, decrypt } from "./powens.js";

export const virementConfigured = () => Boolean(String(process.env.PAIEMENT_IBAN || "").trim());
export const virementInfo = () => ({
  iban: String(process.env.PAIEMENT_IBAN || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim(),
  titulaire: String(process.env.PAIEMENT_TITULAIRE || "").trim(),
  bic: String(process.env.PAIEMENT_BIC || "").trim(),
});

// Code de virement propre à chaque compte (toujours le même, impossible à deviner pour un autre compte).
export function refFor(userId) {
  const h = crypto.createHash("sha256").update("patrimo-virement:" + userId).digest();
  return "PAT" + BigInt("0x" + h.subarray(0, 6).toString("hex")).toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
}

// Montants acceptés, du plus cher au moins cher.
export const TARIFS = PLANS.filter((p) => !p.hidden).flatMap((p) => [
  { plan: p.id, billing: "yearly", amount: p.yearly, months: 12 },
  { plan: p.id, billing: "monthly", amount: p.monthly, months: 1 },
]).sort((a, b) => b.amount - a.amount);
export const tarifFor = (amount) => TARIFS.find((t) => Number(amount) >= t.amount - 0.01) || null;

const addMonths = (ms, n) => { const d = new Date(ms); d.setUTCMonth(d.getUTCMonth() + n); return d.getTime(); };
const plain = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Virements reçus (crédits) → période d'accès. Chaque virement prolonge à partir de la fin en cours (ou de sa date).
export function accessFromTransfers(transfers, ref) {
  const code = plain(ref);
  const mine = transfers.filter((t) => Number(t.amount) > 0 && plain(t.text).includes(code) && tarifFor(t.amount))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let end = 0, plan = null, last = null;
  for (const t of mine) {
    const tarif = tarifFor(t.amount), start = Math.max(end, Date.parse(String(t.date).slice(0, 10) + "T12:00:00Z"));
    end = addMonths(start, tarif.months) + 3 * 864e5; // 3 jours de marge pour le virement suivant
    plan = tarif.plan; last = t;
  }
  return { count: mine.length, plan, end: end ? new Date(end).toISOString() : null, last };
}

// Compte Patrimo du propriétaire (celui dont la banque reçoit les virements).
let ownerCache = null;
async function ownerUserId(db) {
  if (ownerCache) return ownerCache;
  const email = String(process.env.PAIEMENT_PROPRIETAIRE || OWNER_EMAILS[0]).toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const u = (data?.users || []).find((x) => String(x.email || "").toLowerCase() === email);
    if (u) return (ownerCache = u.id);
    if ((data?.users || []).length < 200) break;
  }
  throw new Error("Compte du propriétaire introuvable.");
}

// Lit les virements reçus sur la banque du propriétaire (Powens), en demandant d'abord à la banque ses dernières opérations.
export async function incomingTransfers(db, { sinceDays = 400, refresh = false } = {}) {
  const ownerId = await ownerUserId(db);
  const { data: link } = await db.from("powens_links").select("token_cipher").eq("user_id", ownerId).maybeSingle();
  if (!link) throw new Error("La banque qui reçoit les virements n’est pas connectée dans Patrimo.");
  const { api } = powensConfig(), token = decrypt(link.token_cipher), auth = { Authorization: "Bearer " + token };
  if (refresh) {
    try {
      const c = await powensFetch(api + "/users/me/connections", { headers: auth });
      await Promise.allSettled((c.connections || []).filter((x) => !x.error).map((x) => powensFetch(`${api}/users/me/connections/${x.id}`, { method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: "{}" })));
    } catch (e) { console.warn("[virement] rafraîchissement", e.message); }
  }
  const since = new Date(Date.now() - sinceDays * 864e5).toISOString().slice(0, 10), out = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const page = await powensFetch(`${api}/users/me/transactions?min_date=${since}&limit=1000&offset=${offset}`, { headers: auth });
    const list = page.transactions || [];
    for (const t of list) {
      const amount = Number(t.value ?? t.amount);
      if (amount > 0) out.push({ id: String(t.id), date: String(t.date || t.rdate).slice(0, 10), amount, text: [t.original_wording, t.wording, t.simplified_wording, t.comment].filter(Boolean).join(" ") });
    }
    if (list.length < 1000) break;
  }
  return out;
}
