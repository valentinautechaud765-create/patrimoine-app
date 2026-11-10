import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "secret-test";
process.env.LEMONSQUEEZY_VARIANT_PLUS_MONTHLY = "101";
process.env.LEMONSQUEEZY_VARIANT_PRO_YEARLY = "204";
const { lemonSignatureOk, profileFromSubscription, planFromVariant } = await import("../lib/lemon.js");
const { accessFor } = await import("../lib/config.js");

test("signature Lemon Squeezy : acceptée si correcte, refusée sinon", () => {
  const body = JSON.stringify({ meta: { event_name: "subscription_created" } });
  const sig = crypto.createHmac("sha256", "secret-test").update(body).digest("hex");
  assert.equal(lemonSignatureOk(body, sig), true);
  assert.equal(lemonSignatureOk(body, sig.replace(/.$/, "0")), false);
  assert.equal(lemonSignatureOk(body, ""), false);
});
test("formule retrouvée à partir de la variante", () => {
  assert.equal(planFromVariant(101), "plus"); assert.equal(planFromVariant("204"), "pro"); assert.equal(planFromVariant(999), null);
});
test("abonnement actif : accès payé", () => {
  const p = profileFromSubscription({ status: "active", variant_id: 101, renews_at: "2026-12-10T00:00:00Z" });
  assert.equal(p.plan, "plus"); assert.equal(accessFor({ ...p, created_at: "2026-01-01" }).paid, true);
});
test("résilié : accès jusqu'à la fin de la période payée, puis verrouillé", () => {
  const now = Date.parse("2026-11-10T00:00:00Z");
  const encore = profileFromSubscription({ status: "cancelled", variant_id: 204, ends_at: "2026-11-20T00:00:00Z" }, now);
  assert.equal(encore.plan, "pro");
  const fini = profileFromSubscription({ status: "cancelled", variant_id: 204, ends_at: "2026-11-01T00:00:00Z" }, now);
  assert.equal(fini.plan, "free"); assert.equal(accessFor({ ...fini, created_at: "2026-01-01" }).locked, true);
});
test("expiré ou impayé : verrouillé", () => {
  for (const status of ["expired", "unpaid", "paused"]) assert.equal(profileFromSubscription({ status, variant_id: 101 }).plan, "free");
});
