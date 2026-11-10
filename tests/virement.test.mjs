import test from "node:test";
import assert from "node:assert/strict";
import { accessFromTransfers, refFor, tarifFor } from "../lib/virement.js";
import { accessFor } from "../lib/config.js";

test("code de virement : stable et propre à chaque compte", () => {
  assert.equal(refFor("u1"), refFor("u1")); assert.notEqual(refFor("u1"), refFor("u2")); assert.match(refFor("u1"), /^PAT[0-9A-Z]{6}$/);
});
test("montant → formule et durée", () => {
  assert.deepEqual([tarifFor(7.99).plan, tarifFor(7.99).months], ["plus", 1]);
  assert.deepEqual([tarifFor(66.99).plan, tarifFor(66.99).months], ["plus", 12]);
  assert.deepEqual([tarifFor(14.99).plan, tarifFor(14.99).months], ["pro", 1]);
  assert.deepEqual([tarifFor(124.99).plan, tarifFor(124.99).months], ["pro", 12]);
  assert.equal(tarifFor(5), null);
});
test("virement retrouvé grâce au code, même écrit avec des espaces ou en minuscules", () => {
  const ref = refFor("client");
  const r = accessFromTransfers([
    { id: "1", date: "2026-11-10", amount: 7.99, text: "VIR SEPA RECU /DE DUPONT /MOTIF " + ref.toLowerCase().replace("PAT", "pat ") },
    { id: "2", date: "2026-11-10", amount: 7.99, text: "VIR SEPA RECU /MOTIF AUTRE" },
  ], ref);
  assert.equal(r.count, 1); assert.equal(r.plan, "plus");
  assert.ok(Date.parse(r.end) > Date.parse("2026-12-10"));
});
test("deux virements mensuels s'additionnent", () => {
  const ref = refFor("c2");
  const r = accessFromTransfers([{ id: "a", date: "2026-10-01", amount: 7.99, text: ref }, { id: "b", date: "2026-10-20", amount: 7.99, text: ref }], ref);
  assert.ok(Date.parse(r.end) >= Date.parse("2026-12-01"));
});
test("accès par virement : ouvert pendant la période, verrouillé après", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  assert.equal(accessFor({ plan: "plus", plan_status: "virement", current_period_end: "2026-12-01", created_at: "2026-01-01" }, now).paid, true);
  assert.equal(accessFor({ plan: "plus", plan_status: "virement", current_period_end: "2026-11-01", created_at: "2026-01-01" }, now).locked, true);
});
