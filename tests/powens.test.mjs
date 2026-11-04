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
      delete() { op = "delete"; return b; },
      then(res) {
        if (op === "delete") { const gone = apply(); t[table] = t[table].filter((r) => !gone.includes(r)); return res({ data: gone, error: null }); }
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
const CALLS = [];
globalThis.fetch = async (url, opts = {}) => {
  const path = String(url).replace("https://test.biapi.pro/2.0", "");
  CALLS.push((opts.method || "GET") + " " + path.split("?")[0]);
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

test("compte déjà saisi à la main (ou importé de Mon Patrimoine) : relié à la banque, aucun doublon de compte ni d'opération", async () => {
  BANK = bankV1();
  const db = fakeDb();
  // Avant la connexion : le compte Revolut saisi à la main, une course notée à la main (1 jour d'écart, autre libellé),
  // le loyer créé par une opération automatique, et le prêt auto noté dans les dettes.
  db.tables.accounts.push({ id: "m1", user_id: "u1", powens_account_id: null, name: "Mon Revolut", institution: "Revolut", kind: "courant", balance: 500 });
  db.tables.accounts.push({ id: "m2", user_id: "u1", powens_account_id: null, name: "Livret BNP", institution: "BNP", kind: "epargne", balance: 50 });
  db.tables.transactions.push({ id: "t1", user_id: "u1", account_id: "m1", date: "2026-11-01", amount: -23.4, label: "Courses Carrefour", category: "Courses", external_id: null });
  db.tables.transactions.push({ id: "t2", user_id: "u1", account_id: "m1", date: "2026-11-01", amount: 2450, label: "Salaire", category: "Salaire", external_id: null, recurrence_id: "r1" });
  db.tables.debts.push({ id: "d1", user_id: "u1", kind: "credit", label: "Prêt auto", initial_amount: 8000, remaining: 6000, powens_account_id: null });
  const r = await syncUser(db, "u1");
  const accs = db.tables.accounts, tx = db.tables.transactions;
  // Le compte courant Revolut est relié au compte saisi à la main (pas de 2e compte) ; le livret Revolut est nouveau ;
  // le livret BNP n'est pas touché (autre banque).
  assert.equal(accs.find((a) => a.id === "m1").powens_account_id, "1");
  assert.equal(accs.find((a) => a.id === "m1").balance, 845.12);
  assert.equal(accs.find((a) => a.id === "m1").name, "Mon Revolut");          // le nom choisi est gardé
  assert.equal(accs.find((a) => a.id === "m2").powens_account_id, null);
  assert.equal(accs.length, 3);
  assert.equal(r.linkedAccounts, 1); assert.equal(r.newAccounts, 1);
  // La course et le salaire déjà notés ne sont pas ajoutés une 2e fois : ils reçoivent l'identifiant de la banque
  assert.equal(tx.filter((t) => Math.abs(t.amount + 23.4) < 0.001).length, 1);
  assert.equal(tx.find((t) => t.id === "t1").external_id, "powens:100");
  assert.equal(tx.find((t) => t.id === "t1").category, "Courses");          // la catégorie choisie est gardée
  assert.equal(tx.filter((t) => t.amount === 2450).length, 1);
  assert.equal(r.mergedTransactions, 2);
  // Le crédit déjà noté est relié, pas recréé
  assert.equal(db.tables.debts.length, 1); assert.equal(db.tables.debts[0].remaining, 5400);
  // Deuxième synchro : rien ne bouge
  const r2 = await syncUser(db, "u1");
  assert.equal(r2.transactions, 0); assert.equal(r2.mergedTransactions, 0); assert.equal(db.tables.accounts.length, 3);
});

test("banques au nom proche : BNP = BNP Paribas, mais Banque Populaire ≠ Banque Postale", async () => {
  BANK = { connections: [{ id: 9, connector: { name: "La Banque Postale" } }], accounts: [{ id: 30, id_connection: 9, name: "CCP", type: "checking", balance: 10 }], transactions: [] };
  const db = fakeDb();
  db.tables.accounts.push({ id: "bp", user_id: "u1", powens_account_id: null, name: "Compte", institution: "Banque Populaire", kind: "courant", balance: 1 });
  await syncUser(db, "u1");
  assert.equal(db.tables.accounts.find((a) => a.id === "bp").powens_account_id, null);
  assert.equal(db.tables.accounts.length, 2);
  BANK = { connections: [{ id: 9, connector: { name: "BNP Paribas" } }], accounts: [{ id: 31, id_connection: 9, name: "Compte chèques", type: "checking", balance: 10 }], transactions: [] };
  const db2 = fakeDb();
  db2.tables.accounts.push({ id: "bnp", user_id: "u1", powens_account_id: null, name: "Courant", institution: "BNP", kind: "courant", balance: 1 });
  await syncUser(db2, "u1");
  assert.equal(db2.tables.accounts.find((a) => a.id === "bnp").powens_account_id, "31");
  assert.equal(db2.tables.accounts.length, 1);
});

test("cas réel : Revolut saisi à la main + BNP synchronisée → les comptes Revolut restent manuels et intacts", async () => {
  BANK = { connections: [{ id: 5, connector: { name: "BNP Paribas" } }],
    accounts: [{ id: 70, id_connection: 5, name: "Compte chèques", type: "checking", balance: 312.5 }],
    transactions: [{ id: 700, id_account: 70, date: "2026-11-02", value: -12, simplified_wording: "BOULANGERIE" },
      { id: 701, id_account: 70, date: "2026-11-03", value: -50, simplified_wording: "VIR VERS REVOLUT" }] };
  const db = fakeDb();
  db.tables.accounts.push({ id: "rev1", user_id: "u1", powens_account_id: null, name: "Compte principal", institution: "Revolut", kind: "courant", balance: 0.83 });
  db.tables.accounts.push({ id: "rev2", user_id: "u1", powens_account_id: null, name: "appart", institution: "Revolut", kind: "courant", balance: 0 });
  db.tables.transactions.push({ id: "mt", user_id: "u1", account_id: "rev1", date: "2026-11-02", amount: -12, label: "Kebab", category: "Restaurants", external_id: null });
  const r = await syncUser(db, "u1");
  const rev1 = db.tables.accounts.find((a) => a.id === "rev1"), rev2 = db.tables.accounts.find((a) => a.id === "rev2");
  assert.equal(rev1.powens_account_id, null); assert.equal(rev2.powens_account_id, null);   // toujours manuels
  assert.equal(rev1.balance, 0.83); assert.equal(rev2.balance, 0);                          // soldes non touchés
  assert.equal(r.newAccounts, 1); assert.equal(db.tables.accounts.length, 3);               // le compte BNP est ajouté à part
  // L'opération manuelle Revolut de même montant le même jour n'est PAS confondue avec celle de la BNP
  assert.equal(db.tables.transactions.find((t) => t.id === "mt").external_id, null);
  assert.equal(db.tables.transactions.filter((t) => t.amount === -12).length, 2);
  assert.equal(r.mergedTransactions, 0);
  // Le virement BNP → Revolut n'est pas une dépense : c'est de l'argent qui change de compte
  assert.equal(db.tables.transactions.find((t) => t.label === "VIR VERS REVOLUT").category, "Virement interne");
  assert.equal(db.tables.transactions.find((t) => t.label === "BOULANGERIE").category === "Virement interne", false);
});

test("virement BNP ↔ Revolut (saisi à la main) : l'opération en face est créée toute seule, solde Revolut à jour, sans doublon", async () => {
  BANK = { connections: [{ id: 5, connector: { name: "BNP Paribas" } }],
    accounts: [{ id: 70, id_connection: 5, name: "Compte chèques", type: "checking", balance: 312.5 }],
    transactions: [
      { id: 800, id_account: 70, date: "2026-10-20", value: -100, simplified_wording: "VIR VERS REVOLUT" },          // avant la connexion : on n'y touche pas
      { id: 801, id_account: 70, date: "2026-11-03", value: -50, simplified_wording: "VIR VERS REVOLUT" },           // BNP → Revolut
      { id: 802, id_account: 70, date: "2026-11-04", value: 30, simplified_wording: "VIR DE REVOLUT VALENTIN" },     // Revolut → BNP
      { id: 803, id_account: 70, date: "2026-11-05", value: -40, simplified_wording: "VIREMENT REVOLUT" },           // déjà noté à la main
      { id: 804, id_account: 70, date: "2026-11-05", value: -20, simplified_wording: "VIR VERS REVOLUT APPART" }]};  // vers la pocket « appart »
  const db = fakeDb();
  db.tables.powens_links[0].created_at = "2026-11-01T10:00:00Z";
  db.tables.accounts.push({ id: "rev1", user_id: "u1", powens_account_id: null, name: "Compte principal", institution: "Revolut", kind: "courant", balance: 0.83 });
  db.tables.accounts.push({ id: "rev2", user_id: "u1", powens_account_id: null, name: "appart", institution: "Revolut", kind: "courant", balance: 0 });
  db.tables.transactions.push({ id: "deja", user_id: "u1", account_id: "rev1", date: "2026-11-05", amount: 40, label: "Depuis BNP", category: "Autre", external_id: null });
  const r = await syncUser(db, "u1");
  const tx = db.tables.transactions, acc = (id) => db.tables.accounts.find((a) => a.id === id);
  const onRev1 = tx.filter((t) => t.account_id === "rev1");
  assert.equal(r.mirroredTransfers, 3);
  assert.ok(onRev1.some((t) => t.amount === 50 && t.date === "2026-11-03" && t.category === "Virement interne"));
  assert.ok(onRev1.some((t) => t.amount === -30 && t.date === "2026-11-04"));
  assert.ok(!onRev1.some((t) => t.amount === 100));                                    // ancien virement : rien
  assert.equal(onRev1.filter((t) => t.amount === 40).length, 1);                       // déjà noté : pas de doublon
  assert.equal(tx.find((t) => t.id === "deja").category, "Virement interne");
  assert.ok(tx.some((t) => t.account_id === "rev2" && t.amount === 20));              // la pocket citée dans le libellé
  assert.equal(acc("rev1").balance, 20.83);                                             // 0,83 + 50 − 30
  assert.equal(acc("rev2").balance, 20);
  // Côté BNP, ces virements ne sont pas des dépenses
  assert.ok(tx.filter((t) => t.account_id !== "rev1" && t.account_id !== "rev2").every((t) => t.category === "Virement interne"));
  // Nouvelle synchro : rien n'est recréé, les soldes ne bougent pas
  const r2 = await syncUser(db, "u1");
  assert.equal(r2.mirroredTransfers, 0); assert.equal(acc("rev1").balance, 20.83); assert.equal(tx.length, onRev1.length + 1 + 5);
});


test("connexions en double (« Connecter ma banque » cliqué 5 fois) : 2 comptes seulement, copies et opérations en trop nettoyées", async () => {
  // Powens : 5 connexions BNP de test, chacune avec les 2 mêmes comptes (même numéro) et les mêmes opérations
  const connections = [11, 12, 13, 14, 15].map((id) => ({ id, connector: { name: "BNP Paribas" } }));
  const accounts = connections.flatMap((c, i) => [
    // Comme la banque de test : identifiants Powens différents à chaque connexion, numéro complet absent
    { id: 100 + i * 2, id_connection: c.id, name: "Compte de chèques ****2229", webid: "w" + (100 + i * 2), iban: "FR7630004000031234567" + (8000 + i), type: "checking", balance: -90 },
    { id: 101 + i * 2, id_connection: c.id, name: "Compte de chèques ****8992", webid: "w" + (101 + i * 2), iban: "FR7630004000039876543" + (7000 + i), type: "checking", balance: -99.01 }]);
  const transactions = accounts.map((a, i) => ({ id: 1000 + i, id_account: a.id, date: "2026-11-04", value: a.balance, simplified_wording: "PRLV TEST" }));
  BANK = { connections, accounts, transactions };
  const db = fakeDb();
  // Dans Patrimo : les 10 copies déjà créées ce matin, chacune avec son opération, + une opération bancaire orpheline
  accounts.forEach((a) => {
    db.tables.accounts.push({ id: "acc" + a.id, user_id: "u1", powens_account_id: String(a.id), name: a.name, institution: "BNP Paribas", kind: "courant", balance: a.balance });
    db.tables.transactions.push({ id: "tx" + a.id, user_id: "u1", account_id: "acc" + a.id, date: "2026-11-04", amount: a.balance, label: "PRLV TEST", external_id: "powens:" + (1000 + accounts.indexOf(a)) });
  });
  db.tables.transactions.push({ id: "orphan", user_id: "u1", account_id: null, date: "2026-11-03", amount: -90, label: "VIEUX", external_id: "powens:999" });
  db.tables.transactions.push({ id: "manuelle", user_id: "u1", account_id: null, date: "2026-11-03", amount: -12, label: "Kebab", external_id: null });
  CALLS.length = 0;
  const r = await syncUser(db, "u1");
  const accs = db.tables.accounts, tx = db.tables.transactions;
  assert.equal(accs.length, 2);                                                   // plus que 2 comptes
  assert.deepEqual(accs.map((a) => a.balance).sort(), [-90, -99.01].sort());
  assert.equal(Math.round(accs.reduce((s, a) => s + a.balance, 0) * 100) / 100, -189.01); // et non −945 €
  assert.equal(r.removedDuplicateAccounts, 8);
  assert.equal(tx.filter((t) => t.label === "PRLV TEST").length, 2);              // une opération par vrai compte
  assert.ok(!tx.some((t) => t.id === "orphan"));                                   // orpheline bancaire supprimée
  assert.ok(tx.some((t) => t.id === "manuelle"));                                  // une opération manuelle n'est jamais touchée
  assert.equal(CALLS.filter((c) => c.startsWith("DELETE /users/me/connections/")).length, 4); // 4 connexions inutiles supprimées chez Powens
  assert.ok(!CALLS.includes("DELETE /users/me/connections/15"));                  // la plus récente est gardée
  // Synchro suivante : stable
  const r2 = await syncUser(db, "u1");
  assert.equal(db.tables.accounts.length, 2); assert.equal(r2.newAccounts, 0); assert.equal(r2.transactions, 0);
});
