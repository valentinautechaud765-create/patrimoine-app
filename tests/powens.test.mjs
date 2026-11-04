// Synchronisation bancaire : Powens simulé + base simulée, lancée deux fois (aucun doublon attendu).
import test from "node:test";
import assert from "node:assert/strict";

process.env.POWENS_DOMAIN = "test.biapi.pro"; process.env.POWENS_CLIENT_ID = "id"; process.env.POWENS_CLIENT_SECRET = "secret"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const { encrypt } = await import("../lib/powens.js");
const { syncUser } = await import("../lib/powensSync.js");

// Base simulée : tables en mémoire, avec contrainte unique (user_id, external_id) comme en vrai
function fakeDb() {
  const t = { powens_links: [{ user_id: "u1", token_cipher: encrypt("tok"), last_sync: null }], accounts: [], transactions: [] };
  let n = 0;
  const q = (table) => {
    let rows = () => t[table], filters = [], op = null, payload = null, opts = {};
    const apply = () => t[table].filter((r) => filters.every((f) => f(r)));
    const b = {
      select() { return b; }, eq(k, v) { filters.push((r) => r[k] === v); return b; }, not(k) { filters.push((r) => r[k] != null); return b; },
      maybeSingle() { return Promise.resolve({ data: apply()[0] || null }); },
      update(p) { op = "update"; payload = p; return b; }, insert(p) { op = "insert"; payload = p; return b; }, upsert(p, o) { op = "upsert"; payload = p; opts = o; return b; },
      then(res) {
        if (op === "update") { apply().forEach((r) => Object.assign(r, payload)); return res({ data: null, error: null }); }
        if (op === "insert") { const ins = payload.map((r) => ({ id: "id" + n++, ...r })); t[table].push(...ins); return res({ data: ins, error: null }); }
        if (op === "upsert") { const ins = payload.filter((r) => !t[table].some((x) => x.user_id === r.user_id && x.external_id === r.external_id)).map((r) => ({ id: "id" + n++, ...r })); t[table].push(...ins); return res({ data: ins, error: null }); }
        return res({ data: apply(), error: null });
      },
    };
    return b;
  };
  return { from: q, tables: t };
}

globalThis.fetch = async (url) => {
  const path = String(url).replace("https://test.biapi.pro/2.0", "");
  const body = path.startsWith("/users/me/connections") ? { connections: [{ id: 7, connector: { name: "Revolut" } }] }
    : path.startsWith("/users/me/accounts") ? { accounts: [
      { id: 1, id_connection: 7, name: "Compte principal", type: "checking", balance: 845.12, currency: { id: "EUR" } },
      { id: 2, id_connection: 7, name: "Livret", type: "savings", balance: 1200, currency: { id: "EUR" } },
      { id: 3, id_connection: 7, name: "Carte différée", type: "card", balance: -300 } ] }
    : path.startsWith("/users/me/transactions") ? { transactions: [
      { id: 100, id_account: 1, date: "2026-11-02", value: -23.4, simplified_wording: "CARREFOUR MARKET" },
      { id: 101, id_account: 1, date: "2026-11-01", value: 2450, simplified_wording: "VIR SALAIRE" },
      { id: 102, id_account: 1, date: "2026-11-03", value: -9.99, simplified_wording: "NETFLIX", coming: true },
      { id: 103, id_account: 3, date: "2026-11-03", value: -50, simplified_wording: "CB CARTE" } ] }
    : {};
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};

test("synchro bancaire : comptes, opérations, catégories, et aucun doublon", async () => {
  const db = fakeDb();
  const r1 = await syncUser(db, "u1");
  assert.equal(r1.newAccounts, 2);                 // la carte différée est ignorée
  assert.equal(r1.transactions, 2);                // l'opération « à venir » et celle de la carte sont ignorées
  const accs = db.tables.accounts;
  assert.equal(accs.find((a) => a.powens_account_id === "1").institution, "Revolut");
  assert.equal(accs.find((a) => a.powens_account_id === "2").kind, "epargne");
  const tx = db.tables.transactions;
  assert.equal(tx.find((t) => t.label === "CARREFOUR MARKET").category, "Courses");
  assert.equal(tx.find((t) => t.label === "VIR SALAIRE").category, "Salaire");
  assert.ok(db.tables.powens_links[0].last_sync);

  accs[0].name = "Mon compte perso";               // l'utilisateur renomme son compte
  const r2 = await syncUser(db, "u1");
  assert.equal(r2.newAccounts, 0);
  assert.equal(r2.transactions, 0);                // relancée : rien en double
  assert.equal(db.tables.transactions.length, 2);
  assert.equal(db.tables.accounts.length, 2);
  assert.equal(accs[0].name, "Mon compte perso");  // le nom choisi est conservé
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
