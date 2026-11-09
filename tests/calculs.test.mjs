// Tests des calculs financiers de Patrimo : lancer avec « npm test ».
import test from "node:test";
import assert from "node:assert/strict";
import { simulate, cagr, reliableRate, rateBreakdown, positionFromTrades, advanceDate, monthlyNetMedian, buildWealthCurve, computeModel } from "../lib/model.js";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test("simulation : intérêts composés mensuels", () => {
  near(simulate({ start: 1000, monthly: 0, rate: 12, years: 1 }).mid.at(-1), 1000 * Math.pow(1.01, 12));
  const s = simulate({ start: 0, monthly: 100, rate: 6, years: 10 }), i = 0.06 / 12;
  near(s.mid.at(-1), 100 * ((Math.pow(1 + i, 120) - 1) / i)); // formule de la rente
  assert.equal(s.contrib.at(-1), 12000);
  assert.ok(s.low.at(-1) < s.mid.at(-1) && s.mid.at(-1) < s.high.at(-1));
});

test("simulation : sans rendement, on récupère exactement ses apports", () => {
  assert.equal(simulate({ start: 500, monthly: 100, rate: 0, years: 1 }).mid.at(-1), 1700);
});

test("simulation : inflation retirée (rendement = inflation → pouvoir d'achat constant)", () => {
  near(simulate({ start: 0, monthly: 100, rate: 2, years: 10, inflation: 2 }).mid.at(-1), 12000);
});

test("performance annuelle réelle (CAGR)", () => {
  const t0 = Date.UTC(2015, 0, 1), t1 = t0 + 10 * 365.25 * 864e5;
  near(cagr([{ t: t0, p: 100 }, { t: t1, p: 200 }]).rate, (Math.pow(2, 0.1) - 1) * 100, 0.001);
  // Les cours ajustés (dividendes compris) sont prioritaires
  near(cagr([{ t: t0, p: 100, a: 100 }, { t: t1, p: 150, a: 200 }]).rate, (Math.pow(2, 0.1) - 1) * 100, 0.001);
  assert.equal(cagr([{ t: t0, p: 100 }, { t: t0 + 200 * 864e5, p: 150 }]), null); // moins d'un an : rien
});

test("fiabilité du rendement selon la durée d'historique", () => {
  assert.deepEqual(reliableRate({ rate: 40, years: 2 }, "ETF").kind, "estimate"); // trop court → moyenne de long terme
  assert.equal(reliableRate({ rate: 40, years: 2 }, "ETF").rate, 6);
  assert.equal(reliableRate({ rate: 10, years: 5 }, "ETF").rate, 8); // 50 % réel + 50 % long terme
  assert.equal(reliableRate({ rate: 20, years: 12 }, "Action").rate, 12); // plafond de prudence
  assert.equal(reliableRate({ rate: 8, years: 10 }, "ETF").rate, 8);
  assert.equal(reliableRate({ rate: 8, years: 9.9 }, "ETF").kind, "real"); // « 10 ans » de la source = 9,9 ans
});

test("rendement moyen pondéré par le poids de chaque élément", () => {
  const bd = rateBreakdown({
    accounts: [{ id: "a", kind: "courant", balance: 1000 }, { id: "b", name: "Livret A", kind: "epargne", balance: 1000, rate: 3 }],
    holdings: [{ id: "h", ticker: "XXX", asset_class: "ETF", value: 2000 }],
  });
  assert.equal(bd.total, 4000);
  assert.equal(bd.rate, Math.round(((0 * 1000 + 3 * 1000 + 6 * 2000) / 4000) * 10) / 10);
});

test("position : prix de revient moyen pondéré et plus-value réalisée", () => {
  const p = positionFromTrades([
    { type: "Achat", quantity: 10, amount: 1000, date: "2025-01-01" },
    { type: "Achat", quantity: 10, amount: 1200, date: "2025-02-01" },
    { type: "Vente", quantity: 5, amount: 700, date: "2025-03-01" },
    { type: "Dividende", quantity: 0, amount: 12, date: "2025-04-01" },
  ]);
  assert.equal(p.quantity, 15);
  assert.equal(p.cost, 1650);     // 2200 − 5 × 110
  assert.equal(p.realized, 150);  // 700 − 550
  assert.equal(p.dividends, 12);
});

test("échéances automatiques : fin de mois et années bissextiles", () => {
  assert.equal(advanceDate("2026-01-31", "mensuelle", 31), "2026-02-28");
  assert.equal(advanceDate("2026-02-28", "mensuelle", 31), "2026-03-31");
  assert.equal(advanceDate("2024-02-29", "annuelle", 29), "2025-02-28");
  assert.equal(advanceDate("2026-11-04", "hebdomadaire", 4), "2026-11-11");
  assert.equal(advanceDate("2026-11-15", "trimestrielle", 15), "2027-02-15");
});

test("épargne mensuelle : un mois exceptionnel ne fausse pas le calcul (médiane)", () => {
  const d = new Date(), m = (k) => new Date(d.getFullYear(), d.getMonth() - k, 10).toISOString().slice(0, 10);
  const tx = [{ date: m(1), amount: 1000 }, { date: m(2), amount: 1000 }, { date: m(3), amount: 5000 }].map((t) => ({ ...t, category: "Salaire" }));
  assert.equal(monthlyNetMedian(tx).inc, 1000);
});

test("courbe du patrimoine : se termine exactement sur le total actuel", () => {
  const now = Date.now(), pts = Array.from({ length: 20 }, (_, i) => ({ t: now - (20 - i) * 3600e3, p: 10 }));
  const curve = buildWealthCurve({ series: { AAA: { currency: "EUR", points: pts } }, holdings: [{ id: "h", ticker: "AAA", quantity: 5, value: 50 }], transactions: [], totalNow: 1050 });
  assert.equal(curve.at(-1).value, 1050);
  assert.ok(curve.every((x) => x.value === 1050)); // cours constant, aucune opération → patrimoine constant
});

test("modèle : total = comptes + épargne + placements", () => {
  const m = computeModel({ accounts: [{ id: "a", kind: "courant", balance: 100 }, { id: "b", kind: "epargne", balance: 200 }], holdings: [{ id: "h", value: 300, cost_basis: 250 }], transactions: [], budgets: [] });
  assert.equal(m.total, 600);
  assert.equal(m.hValue - m.cost, 50);
});


test("disponible par jour : jours calendaires restants et arrondi prudent au centime", () => {
  const m = computeModel({ accounts: [], holdings: [], transactions: [], budgets: [], debts: [], debtPayments: [], recurrences: [] });
  assert.equal(m.daysLeft, m.daysInMonth - m.dayOfMonth + 1); // aujourd'hui inclus
  const expected = m.daysLeft > 0 ? Math.floor((Math.max(0, m.available) / m.daysLeft) * 100) / 100 : 0;
  assert.equal(m.perDay, expected);
  assert.ok(m.perDay <= (m.daysLeft > 0 ? Math.max(0, m.available) / m.daysLeft : 0)); // jamais au-dessus du budget réel
});
