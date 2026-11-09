import { createClient } from "@supabase/supabase-js";

// Stockage persistant de la session : IndexedDB en priorité (adapté à la PWA iOS),
// avec migration transparente de l'ancienne session localStorage.
function createSessionStorage() {
  const DB_NAME = "patrimo-auth";
  const STORE_NAME = "sessions";
  let dbPromise;

  function openDb() {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB indisponible"));
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Ouverture du stockage impossible"));
        request.onblocked = () => reject(new Error("Ouverture du stockage bloquée"));
      });
    }
    return dbPromise;
  }

  async function readFromDb(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async function writeToDb(key, value, remove = false) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      if (remove) store.delete(key);
      else store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Écriture du stockage annulée"));
    });
  }

  return {
    async getItem(key) {
      try {
        const value = await readFromDb(key);
        if (value !== null) return value;
      } catch {}
      // Migration des sessions créées avant cette mise à jour.
      try {
        const value = window.localStorage.getItem(key);
        if (value) {
          try { await writeToDb(key, value); } catch {}
        }
        return value;
      } catch {
        return null;
      }
    },
    async setItem(key, value) {
      try {
        await writeToDb(key, value);
      } catch {
        try { window.localStorage.setItem(key, value); } catch (error) {
          console.error("[Patrimo] Impossible de conserver la session sur cet appareil.", error);
          throw error;
        }
      }
    },
    async removeItem(key) {
      try { await writeToDb(key, null, true); } catch {}
      try { window.localStorage.removeItem(key); } catch {}
    },
  };
}

// Client navigateur : la session reste enregistrée entre les ouvertures de la PWA.
export const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
let browserClient = null;
export function supabaseBrowser() {
  if (!supabaseConfigured) return null;
  if (!browserClient) {
    const storage = typeof window !== "undefined" ? createSessionStorage() : undefined;
    browserClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        ...(storage ? { storage } : {}),
      },
    });
  }
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
  if (error && /invalid api key|no api key/i.test(error.message || "")) throw new Error("Configuration Supabase du serveur incorrecte : vérifie SUPABASE_SERVICE_ROLE_KEY sur Vercel.");
  return error ? null : data.user;
}
