// Synchronisation bancaire : Powens simulé + base simulée, lancée deux fois (aucun doublon attendu).
import test from "node:test";
import assert from "node:assert/strict";

process.env.POWENS_DOMAIN = "test.biapi.pro"; process.env.POWENS_CLIENT_ID = "id"; process.env.POWENS_CLIENT_SECRET = "secret"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const { encrypt } = await import("../lib/powens.js");
const { syncUser } = await import("../lib/powensSync.js");

// Base simulée : tables en mémoire, avec contrainte unique (user_id, external_id) comme en vrai
function fakeDb() {
  const t = { powens_links: [{ user_id: "u1", token_cipher: encrypt("tok"), last_sync: null }], accounts: [], transactions: [], debts: [] };
  let n = 0;
  const q = (table) => {
    let rows = () => t[table], filters = [], op = null, payload = null, opts = {};
    const apply = () => t[table].filter((r) => filters.every((f) => f(r)));
    const b = {
      select() { return b; }, eq(k, v) { filters.push((r) => r[k] === v); return b; }, not(k) { filters.push((r) => r[k] != null); return b; },
      gte(k, v) { filters.push((r) => String(r[k]) >= String(v)); return b; }, in(k, v) { filters.push((r) => v.includes(r[k])); return b; },
      maybeSingle() { return Promise.resolve({ data: apply()[0] || null }); },
      update(p) { op = "update"; payload = p; return b; }, insert(p) { op = "insert"; payload = p; return b; }, upsert(p, o) { op = "upsert"; payload = p; opts = o; return b; },
      then(res) {
        if (op === "update") { apply().forEach((r) => Object.assign(r, payload)); return res({ data: null, error: null }); }
        if (op === "insert") { const ins = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ id: "id" + n++, ...r })); t[table].push(...ins); return res({ data: ins, error: null }); }
        if (op === "upsert") { const ins = payload.filter((r) => !t[table].some((x) => x.user_id === r.user_id && x.external_id === r.external_id)).map((r) => ({ id: "id" + n++, ...r })); t[table].push(...ins); return res({ data: ins, error: null }); }
        return res({ data: apply(), error: null });
      },
    };
    return b;
  };
  return { from: q, tables: t };
}

let BANK = null;
const bankV1 = () => ({
  connections: [{ id: 7, connector: { name: "Revolut" } }],
  accounts: [
    { id: 1, id_connection: 7, name: "Compte principal", type: "checking", balance: 845.12, currency: { id: "EUR" } },
    { id: 2, id_connection: 7, name: "Livret", type: "savings", balance: 1200, currency: { id: "EUR" } },
    { id: 3, id_connection: 7, name: "Carte différée", type: "card", balance: -300 },
    { id: 4, id_connection: 7, name: "Prêt auto", type: "loan", balance: -5400, loan: { total_amount: 8000, next_payment_amount: 210 } }],
  transactions: [
    { id: 100, id_account: 1, date: "2026-11-02", value: -23.4, simplified_wording: "CARREFOUR MARKET" },
    { id: 101, id_account: 1, date: "2026-11-01", value: 2450, simplified_wording: "VIR SALAIRE" },
    { id: 102, id_account: 1, date: "2026-11-03", value: -9.99, simplified_wording: "NETFLIX", coming: true },
    { id: 103, id_account: 3, date: "2026-11-03", value: -50, simplified_wording: "CB CARTE" },
    { id: 104, id_account: 1, date: "2026-11-03", value: -4.5, simplified_wording: "CAFE" },
    { id: 105, id_account: 1, date: "2026-11-03", value: -4.5, simplified_wording: "CAFE" },
    { id: 106, id_account: 1, date: "2026-11-02", value: -150, simplified_wording: "To pocket Appart" },
    { id: 107, id_account: 2, date: "2026-11-02", value: 150, simplified_wording: "From main" }],
});
globalThis.fetch = async (url) => {
  const path = String(url).replace("https://test.biapi.pro/2.0", "");
  const body = path.startsWith("/users/me/connections") ? { connections: BANK.connections }
    : path.startsWith("/users/me/accounts") ? { accounts: BANK.accounts }
    : path.startsWith("/users/me/transactions") ? { transactions: BANK.transactions } : {};
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};

test("synchro bancaire : comptes, opérations, catégories, crédits, virements internes, aucun doublon", async () => {
  BANK = bankV1();
  const db = fakeDb();
  const r1 = await syncUser(db, "u1");
  assert.equal(r1.newAccounts, 2);                 // carte différée et crédit ne sont pas des comptes d'avoirs
  assert.equal(r1.transactions, 6);                // « à venir » et carte ignorées ; les 2 cafés identiques sont gardés
  const accs = db.tables.accounts, tx = db.tables.transactions;
  assert.equal(accs.find((a) => a.powens_account_id === "1").institution, "Revolut");
  assert.equal(accs.find((a) => a.powens_account_id === "2").kind, "epargne");
  assert.equal(tx.find((t) => t.label === "CARREFOUR MARKET").category, "Courses");
  assert.equal(tx.find((t) => t.label === "VIR SALAIRE").category, "Salaire");
  assert.equal(tx.filter((t) => t.label === "CAFE").length, 2);
  assert.equal(tx.find((t) => t.label === "To pocket Appart").category, "Virement interne"); // pocket : pas une dépense
  assert.equal(tx.find((t) => t.label === "From main").category, "Virement interne");
  const loan = db.tables.debts[0];
  assert.equal(loan.kind, "credit"); assert.equal(loan.remaining, 5400); assert.equal(loan.initial_amount, 8000);

  accs[0].name = "Mon compte perso";               // l'utilisateur renomme son compte
  const r2 = await syncUser(db, "u1");
  assert.equal(r2.newAccounts, 0); assert.equal(r2.transactions, 0);
  assert.equal(tx.length, 6); assert.equal(accs.length, 2); assert.equal(db.tables.debts.length, 1);
});

test("banque reconnectée : nouveaux identifiants Powens, mais ni compte ni opération en double", async () => {
  BANK = bankV1();
  const db = fakeDb();
  await syncUser(db, "u1");
  // Reconnexion : Powens renvoie les mêmes comptes et opérations avec d'autres identifiants
  const v2 = bankV1();
  v2.accounts = v2.accounts.map((a) => ({ ...a, id: a.id + 50 }));
  v2.transactions = v2.transactions.map((t) => ({ ...t, id: t.id + 500, id_account: t.id_account + 50 }));
  v2.transactions.push({ id: 900, id_account: 51, date: "2026-11-04", value: -12, simplified_wording: "UBER" }); // vraie nouvelle opération
  BANK = v2;
  const r = await syncUser(db, "u1");
  assert.equal(r.newAccounts, 0);                  // l'ancien compte est retrouvé
  assert.equal(db.tables.accounts.length, 2);
  assert.equal(r.transactions, 1);                 // seule la vraie nouvelle opération est ajoutée
  assert.equal(db.tables.transactions.filter((t) => t.label === "CAFE").length, 2);
  assert.equal(db.tables.transactions.length, 7);
});

test("Powens répond une page HTML : message clair au lieu de « Unexpected token < »", async () => {
  const { powensFetch } = await import("../lib/powens.js");
  const saved = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => "<!DOCTYPE html><html>Not found</html>" });
  await assert.rejects(powensFetch("https://x.biapi.pro/2.0/auth/init"), /vérifiez POWENS_DOMAIN/);
  globalThis.fetch = saved;
});

test("POWENS_DOMAIN : formats acceptés et refusés", async () => {
  const { powensConfig } = await import("../lib/powens.js");
  process.env.POWENS_DOMAIN = "https://monappli-sandbox.biapi.pro/2.0/";
  assert.equal(powensConfig().domain, "monappli-sandbox.biapi.pro");
  process.env.POWENS_DOMAIN = "webview.powens.com";
  assert.throws(() => powensConfig(), /POWENS_DOMAIN invalide/);
  process.env.POWENS_DOMAIN = "test.biapi.pro";
});
