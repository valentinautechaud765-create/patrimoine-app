// Alerte « nouvelle opération » juste après une synchronisation bancaire (en plus du résumé quotidien).
// Utilise les abonnements push existants (push_subscriptions) et respecte la préférence « bank » de chaque appareil.
import { sendPush } from "./push.js";

const eur = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Math.abs(Number(n) || 0));
const signed = (n) => (Number(n) > 0 ? "+" : "−") + eur(n);

export function bankMessage(txs, bankOf = () => "") {
  const list = txs.filter((t) => t.category !== "Virement interne").sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  if (!list.length) return null;
  if (list.length === 1) {
    const t = list[0], bank = bankOf(t.account_id);
    return { title: `${Number(t.amount) > 0 ? "Argent reçu" : "Nouvelle dépense"}${bank ? " · " + bank : ""}`, body: `${signed(t.amount)} · ${String(t.label).slice(0, 80)}`, tag: "bank-op-" + t.id };
  }
  const inSum = list.filter((t) => t.amount > 0).reduce((n, t) => n + Number(t.amount), 0);
  const outSum = -list.filter((t) => t.amount < 0).reduce((n, t) => n + Number(t.amount), 0);
  const head = [inSum > 0 && `${signed(inSum)} reçus`, outSum > 0 && `${signed(-outSum)} dépensés`].filter(Boolean).join(" · ");
  return { title: `${list.length} nouvelles opérations`, body: `${head}\n${list.slice(0, 3).map((t) => `${signed(t.amount)} ${String(t.label).slice(0, 40)}`).join("\n")}`, tag: "bank-ops" };
}

// Synchronise, repère les opérations bancaires arrivées pendant cette synchronisation, et prévient.
export async function syncAndAlert(db, userId, syncUser) {
  const started = new Date(Date.now() - 5000).toISOString();
  const result = await syncUser(db, userId);
  if (!result?.linked) return { ...result, notified: 0 };
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const { data: fresh } = await db.from("transactions").select("id,account_id,date,label,amount,category")
    .eq("user_id", userId).gte("created_at", started).gte("date", since).like("external_id", "powens:%");
  if (!fresh?.length) return { ...result, notified: 0 };
  const { data: subs } = await db.from("push_subscriptions").select("*").eq("user_id", userId);
  const devices = (subs || []).filter((s) => (s.preferences || {}).bank !== false);
  if (!devices.length) return { ...result, notified: 0 };
  const accIds = [...new Set(fresh.map((t) => t.account_id).filter(Boolean))];
  const { data: accs } = accIds.length ? await db.from("accounts").select("id,name,institution").in("id", accIds) : { data: [] };
  const msg = bankMessage(fresh, (id) => { const a = (accs || []).find((x) => x.id === id); return a ? a.institution || a.name : ""; });
  if (!msg) return { ...result, notified: 0 };
  let notified = 0;
  for (const sub of devices) {
    try {
      const r = await sendPush(sub, { ...msg, url: "/app?vue=ops" });
      if (r.expired) await db.from("push_subscriptions").delete().eq("id", sub.id); else notified++;
    } catch (e) { console.warn("[alerte banque]", e.message); }
  }
  return { ...result, notified };
}
