import test from "node:test";
import assert from "node:assert/strict";
import { accessFor, TRIAL_DAYS } from "../lib/config.js";

const now = Date.parse("2026-11-10T12:00:00Z"), day = 864e5;
const ago = (d) => new Date(now - d * day).toISOString();

test("essai : tout est débloqué pendant les premiers jours", () => {
  const a = accessFor({ plan: "free", created_at: ago(1) }, now);
  assert.equal(a.trial, true); assert.equal(a.locked, false); assert.equal(a.plan, "plus");
  assert.equal(a.daysLeft, TRIAL_DAYS - 1);
});
test("essai terminé sans abonnement : verrouillé", () => {
  const a = accessFor({ plan: "free", created_at: ago(TRIAL_DAYS + 0.01) }, now);
  assert.equal(a.locked, true);
});
test("abonné : jamais verrouillé, même longtemps après l'inscription", () => {
  assert.equal(accessFor({ plan: "plus", plan_status: "active", created_at: ago(400) }, now).locked, false);
  assert.equal(accessFor({ plan: "pro", plan_status: "past_due", created_at: ago(400) }, now).plan, "pro");
});
test("abonnement résilié après l'essai : verrouillé", () => {
  assert.equal(accessFor({ plan: "plus", plan_status: "canceled", created_at: ago(60) }, now).locked, true);
});

import { bankMessage } from "../lib/bankAlerts.js";
test("alerte banque : une dépense", () => {
  const m = bankMessage([{ id: "t1", amount: -10, label: "Tabac", account_id: "a", category: "Autre" }], () => "BNP Paribas");
  assert.equal(m.title, "Nouvelle dépense · BNP Paribas"); assert.match(m.body, /10,00/);
});
test("alerte banque : plusieurs opérations, virements internes ignorés", () => {
  const m = bankMessage([{ id: "1", amount: -10, label: "A" }, { id: "2", amount: 161, label: "CAF" }, { id: "3", amount: -50, label: "Vers Revolut", category: "Virement interne" }]);
  assert.equal(m.title, "2 nouvelles opérations");
});
