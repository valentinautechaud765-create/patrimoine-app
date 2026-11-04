import { NextResponse } from "next/server";
import { quote, eurPerUsd, intraday, validSymbol } from "../../../lib/quotes.js";
import { supabaseConfigured, userFromRequest } from "../../../lib/supabase.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cours?symbols=VWCE,AAPL            → derniers cours
// GET /api/cours?symbols=VWCE,AAPL&jour=1     → + cours de la journée (courbe en direct)
// Réservé aux utilisateurs connectés (sauf en mode démonstration), 12 titres maximum.
export async function GET(request) {
  if (supabaseConfigured && !(await userFromRequest(request))) return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  const url = new URL(request.url);
  const symbols = [...new Set(String(url.searchParams.get("symbols") || "").toUpperCase().split(",").map((s) => s.trim()).filter(validSymbol))].slice(0, 12);
  const withDay = url.searchParams.get("jour") === "1";
  const [quotes, fx, days] = await Promise.all([
    Promise.all(symbols.map(async (s) => [s, await quote(s)])),
    eurPerUsd(),
    withDay ? Promise.all(symbols.map(async (s) => [s, await intraday(s)])) : [],
  ]);
  return NextResponse.json({ quotes: Object.fromEntries(quotes.filter(([, q]) => q)), eurPerUsd: fx, intraday: Object.fromEntries(days.filter(([, d]) => d)), at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
