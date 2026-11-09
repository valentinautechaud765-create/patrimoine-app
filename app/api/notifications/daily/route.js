import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase.js";
import { sendPush } from "../../../../lib/push.js";
import { computeModel, insights, upcomingItems } from "../../../../lib/model.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const db = supabaseAdmin();
  const { data: subs, error } = await db.from("push_subscriptions").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const groups = new Map();
  for (const sub of subs || []) { if (!groups.has(sub.user_id)) groups.set(sub.user_id, []); groups.get(sub.user_id).push(sub); }
  let sent = 0, expired = 0, failed = 0;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  for (const [userId, devices] of groups) {
    try {
      const tables = ["accounts","holdings","transactions","budgets","recurrences","debts","debt_payments"];
      const results = await Promise.all(tables.map((t) => db.from(t).select("*").eq("user_id", userId)));
      if (results.some((r) => r.error)) throw new Error("Lecture des données financières impossible.");
      const [accounts, holdings, transactions, budgets, recurrences, debts, debtPayments] = results.map((r) => r.data || []);
      const data = { accounts, holdings, transactions, budgets, recurrences, debts, debtPayments };
      const model = computeModel(data), observations = insights(model), upcoming = upcomingItems(data);
      const recent = transactions.filter((t) => t.created_at && Date.now() - new Date(t.created_at).getTime() < 24 * 60 * 60 * 1000);
      const dueSoon = upcoming.filter((x) => x.next >= today && x.next <= new Date(Date.now() + 3 * 864e5).toISOString().slice(0,10) && x.amount < 0);
      const weekly = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" }).format(now) === "Mon";
      const messages = [];
      for (const sub of devices) {
        const p = sub.preferences || {};
        if (p.budget !== false) {
          const b = observations.find((x) => x.tone === "bad" || x.tone === "warn");
          if (b) messages.push({ sub, title: "Alerte budget", body: b.title + " — " + b.text, tag: "budget-" + today });
        }
        if (p.bills !== false && dueSoon.length) {
          const x = dueSoon[0], label = x.label || "Échéance";
          messages.push({ sub, title: "Échéance à venir", body: label + " dans les 3 prochains jours (" + Math.abs(Number(x.amount)).toFixed(2).replace(".", ",") + " €).", tag: "bill-" + today });
        }
        if (p.bank !== false && recent.length) messages.push({ sub, title: "Activité sur tes comptes", body: recent.length + " nouvelle(s) opération(s) enregistrée(s) au cours des dernières 24 h.", tag: "bank-" + today });
        if (p.investments !== false) {
          const invest = observations.find((x) => x.icon === "trending");
          if (invest) messages.push({ sub, title: "Point placements", body: invest.title + " : " + invest.text, tag: "invest-" + today });
        }
        if (p.weekly !== false && weekly) messages.push({ sub, title: "Ton bilan hebdomadaire", body: "Revenus : " + model.income.toFixed(2) + " €. Dépenses : " + model.spent.toFixed(2) + " €. Disponible par jour : " + model.perDay.toFixed(2) + " €.", tag: "weekly-" + today });
      }
      for (const item of messages) {
        try {
          const result = await sendPush(item.sub, { title: item.title, body: item.body, url: "/", tag: item.tag });
          if (result.expired) { expired++; await db.from("push_subscriptions").delete().eq("id", item.sub.id); }
          else sent++;
        } catch (e) { failed++; console.warn("[push send]", e.message); }
      }
    } catch (e) { failed++; console.warn("[push daily user]", userId, e.message); }
  }
  return NextResponse.json({ ok: true, devices: (subs || []).length, sent, expired, failed });
}
