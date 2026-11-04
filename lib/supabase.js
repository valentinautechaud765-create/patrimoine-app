import { createClient } from "@supabase/supabase-js";

// Client navigateur : connexion et lecture des données de l'utilisateur (protégées par les règles RLS).
// Sans configuration, l'appli fonctionne en mode démonstration.
export const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
let browserClient = null;
export function supabaseBrowser() {
  if (!supabaseConfigured) return null;
  if (!browserClient) browserClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return browserClient;
}

// Client serveur (clé de service) : uniquement dans les routes API, jamais envoyé au navigateur.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase n’est pas configuré sur le serveur.");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Vérifie le jeton envoyé par le navigateur (en-tête Authorization: Bearer …) et renvoie l'utilisateur.
export async function userFromRequest(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  // Clé de service fausse sur Vercel : ce n'est pas la session de l'utilisateur, on le dit clairement.
  if (error && /invalid api key|no api key/i.test(error.message || "")) throw new Error("Configuration Supabase du serveur incorrecte : vérifie SUPABASE_SERVICE_ROLE_KEY sur Vercel.");
  return error ? null : data.user;
}
