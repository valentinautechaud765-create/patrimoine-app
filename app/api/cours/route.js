import { NextResponse } from "next/server";
import { quote, eurPerUsd, intraday, history, validSymbol, HISTORY_RANGES } from "../../../lib/quotes.js";
import { supabaseConfigured, userFromRequest } from "../../../lib/supabase.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cours?symbols=VWCE,AAPL            → derniers cours
// GET /api/cours?symbols=VWCE,AAPL&jour=1     → + cours de la journée (courbe en direct)
// Réservé aux utilisateurs connectés (sauf en mode démonstration), 12 titres maximum.
export async function GET(request) {
  if (supabaseConfigured && !(await userFromRequest(request))) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  const url = new URL(request.url);
  // GET /api/cours?historique=VWCE,AAPL&periode=1M → courbes historiques
  if (url.searchParams.get("historique")) {
    const period = HISTORY_RANGES[url.searchParams.get("periode")] ? url.searchParams.get("periode") : "1M";
    const list = [...new Set(String(url.searchParams.get("historique")).toUpperCase().split(",").map((s) => s.trim()).filter(validSymbol))].slice(0, 12);
    const [series, fx] = await Promise.all([Promise.all(list.map(async (s) => [s, await history(s, period)])), eurPerUsd()]);
    return NextResponse.json({ period, series: Object.fromEntries(series.filter(([, d]) => d)), eurPerUsd: fx }, { headers: { "Cache-Control": "no-store" } });
  }
  const symbols = [...new Set(String(url.searchParams.get("symbols") || "").toUpperCase().split(",").map((s) => s.trim()).filter(validSymbol))].slice(0, 12);
  const withDay = url.searchParams.get("jour") === "1";
  const [quotes, fx, days] = await Promise.all([
    Promise.all(symbols.map(async (s) => [s, await quote(s)])),
    eurPerUsd(),
    withDay ? Promise.all(symbols.map(async (s) => [s, await intraday(s)])) : [],
  ]);
  return NextResponse.json({ quotes: Object.fromEntries(quotes.filter(([, q]) => q)), eurPerUsd: fx, intraday: Object.fromEntries(days.filter(([, d]) => d)), at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
