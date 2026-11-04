// Cours de bourse : Tradegate (temps réel, titres européens), Yahoo Finance (actions US, ETF),
// Twelve Data en secours si TWELVE_DATA_API_KEY est configurée. Tout se passe côté serveur.
const TRADEGATE_ISIN = {
  VWCE: "IE00BK5BQT80", VWRL: "IE00B3RBWM25", VWRA: "IE00BK5BQT80", IWDA: "IE00B4L5Y983", SWDA: "IE00B4L5Y983", EUNL: "IE00B4L5Y983",
  CSPX: "IE00B5BMR087", SXR8: "IE00B5BMR087", VUAA: "IE00BFMXXD54", VUSA: "IE00B3XXRP09", EIMI: "IE00BKM4GZ66", IS3N: "IE00BKM4GZ66",
  EXSA: "DE0002635307", CW8: "LU1681043599", EWLD: "FR0011869353", MWRD: "LU1781541179", MC: "FR0000121014", OR: "FR0000120321",
  RMS: "FR0000052292", TTE: "FR0000120271", AIR: "NL0000235190", SAN: "FR0000120578", BNP: "FR0000131104", SU: "FR0000121972",
  AI: "FR0000120073", ASML: "NL0010273215", SAP: "DE0007164600",
};
const YAHOO = {
  VWCE: ["VWCE.DE", "VWCE.AS"], VWRL: ["VWRL.AS"], VWRA: ["VWRA.L"], IWDA: ["IWDA.AS"], SWDA: ["IWDA.AS"], EUNL: ["EUNL.DE"], CSPX: ["CSPX.AS"],
  SXR8: ["SXR8.DE"], VUAA: ["VUAA.DE"], VUSA: ["VUSA.AS"], EIMI: ["IS3N.DE"], IS3N: ["IS3N.DE"], EXSA: ["EXSA.DE"], CW8: ["CW8.PA"],
  EWLD: ["EWLD.PA"], MWRD: ["MWRD.PA"], MC: ["MC.PA"], OR: ["OR.PA"], RMS: ["RMS.PA"], TTE: ["TTE.PA"], AIR: ["AIR.PA"], SAN: ["SAN.PA"],
  BNP: ["BNP.PA"], SU: ["SU.PA"], AI: ["AI.PA"], ASML: ["ASML.AS"], SAP: ["SAP.DE"], BTC: ["BTC-EUR"], ETH: ["ETH-EUR"], SOL: ["SOL-EUR"],
};
export const validSymbol = (s) => /^[A-Z0-9.:\-^=]{1,24}$/.test(s);
const num = (v) => { if (typeof v === "number") return v; const r = String(v ?? "").replace(/[\s €%]/g, ""); return Number(r.includes(",") ? r.replace(/\./g, "").replace(",", ".") : r); };

async function tradegate(symbol) {
  const isin = TRADEGATE_ISIN[symbol]; if (!isin) return null;
  try {
    const r = await fetch("https://www.tradegate.de/refresh.php?isin=" + isin, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json", Referer: "https://www.tradegate.de/orderbuch.php?isin=" + isin }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const d = await r.json(), bid = num(d?.bid), ask = num(d?.ask), last = num(d?.last);
    // Valorisation au prix de vente (bid), comme Revolut et les courtiers : c'est ce que rapporterait
    // la vente immédiate. Si la fourchette est anormale (marché fermé), on prend le dernier échange.
    const okSpread = bid > 0 && ask > 0 && ask >= bid && (ask - bid) / bid < 0.02;
    const price = okSpread ? bid : last;
    if (!(price > 0)) return null;
    const delta = num(d?.delta);
    return { price: Math.round(price * 10000) / 10000, currency: "EUR", changePct: Number.isFinite(delta) ? delta : null, bid: bid > 0 ? bid : null, ask: ask > 0 ? ask : null, source: okSpread ? "Tradegate · prix de vente en temps réel" : "Tradegate · dernier cours", time: new Date().toISOString() };
  } catch { return null; }
}

async function yahooChart(ySymbol, range = "1d", interval = "1m", prePost = false) {
  const u = new URL("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(ySymbol));
  u.searchParams.set("range", range); u.searchParams.set("interval", interval); u.searchParams.set("includePrePost", prePost ? "true" : "false");
  const r = await fetch(u, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (compatible; Patrimo/1.0)" }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  return (await r.json())?.chart?.result?.[0] || null;
}

async function yahoo(symbol) {
  for (const y of YAHOO[symbol] || [symbol]) {
    try {
      // Avant-Bourse et après-Bourse compris (comme Revolut pour les actions américaines) :
      // on garde le prix le plus récent entre la dernière minute cotée et le dernier échange de la séance.
      const res = await yahooChart(y, "1d", "1m", true); if (!res) continue;
      const m = res.meta || {}, t = res.timestamp || [], c = res.indicators?.quote?.[0]?.close || [];
      let k = c.length - 1; while (k >= 0 && !(Number(c[k]) > 0)) k--;
      const candleTime = k >= 0 ? Number(t[k]) || 0 : 0, tradeTime = Number(m.regularMarketTime) || 0;
      const useTrade = Number(m.regularMarketPrice) > 0 && tradeTime >= candleTime;
      const price = useTrade ? Number(m.regularMarketPrice) : Number(c[k]);
      const prev = Number(m.chartPreviousClose || m.previousClose);
      if (!(price > 0)) continue;
      const extended = !useTrade && candleTime > tradeTime;
      return { price, currency: String(m.currency || "EUR").toUpperCase(), changePct: prev > 0 ? ((price - prev) / prev) * 100 : null, source: "Yahoo Finance" + (extended ? " · hors séance" : "") + (Number(m.exchangeDataDelayedBy) > 0 ? " · différé" : ""), time: new Date((useTrade ? tradeTime : candleTime) * 1000).toISOString(), ySymbol: y };
    } catch {}
  }
  return null;
}

async function twelve(symbol) {
  const key = process.env.TWELVE_DATA_API_KEY; if (!key) return null;
  try {
    const u = new URL("https://api.twelvedata.com/quote"); u.searchParams.set("symbol", symbol); u.searchParams.set("apikey", key);
    const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(5000) }), d = await r.json();
    const price = Number(d.close ?? d.price);
    if (!r.ok || d.status === "error" || !(price > 0)) return null;
    return { price, currency: String(d.currency || "EUR").toUpperCase(), changePct: Number.isFinite(Number(d.percent_change)) ? Number(d.percent_change) : null, source: "Twelve Data", time: d.datetime || null };
  } catch { return null; }
}

export async function quote(symbol) {
  const live = await tradegate(symbol);
  const y = await yahoo(symbol);
  if (live) return { ...live, changePct: live.changePct ?? y?.changePct ?? null };
  return y || (await twelve(symbol));
}

// Taux de change : combien d'euros pour 1 dollar
export async function eurPerUsd() {
  try { const res = await yahooChart("EURUSD=X", "1d", "5m"); const p = Number(res?.meta?.regularMarketPrice); return p > 0 ? 1 / p : null; } catch { return null; }
}

// Cours de la journée (toutes les 5 minutes) pour la courbe en direct
export async function intraday(symbol) {
  for (const y of YAHOO[symbol] || [symbol]) {
    try {
      const res = await yahooChart(y, "1d", "5m"); if (!res) continue;
      const t = res.timestamp || [], c = res.indicators?.quote?.[0]?.close || [];
      const points = t.map((s, i) => ({ t: s * 1000, p: Number(c[i]) })).filter((x) => x.p > 0);
      if (points.length) return { currency: String(res.meta?.currency || "EUR").toUpperCase(), points };
    } catch {}
  }
  return null;
}

// Historique d'un cours sur une période (courbes des placements)
export const HISTORY_RANGES = { "1J": ["1d", "5m"], "1S": ["5d", "30m"], "1M": ["1mo", "1h"], "6M": ["6mo", "1d"], "1A": ["1y", "1d"], "Max": ["max", "1wk"] };
export async function history(symbol, period) {
  const [range, interval] = HISTORY_RANGES[period] || HISTORY_RANGES["1M"];
  for (const y of YAHOO[symbol] || [symbol]) {
    try {
      const res = await yahooChart(y, range, interval); if (!res) continue;
      const t = res.timestamp || [], c = res.indicators?.quote?.[0]?.close || [];
      const points = t.map((s, i) => ({ t: s * 1000, p: Number(c[i]) })).filter((x) => x.p > 0);
      if (points.length > 1) return { currency: String(res.meta?.currency || "EUR").toUpperCase(), points };
    } catch {}
  }
  return null;
}
