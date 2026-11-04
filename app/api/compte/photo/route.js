import { NextResponse } from "next/server";
import { supabaseAdmin, userFromRequest } from "../../../../lib/supabase.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Photo de profil : enregistrée dans le stockage Supabase (dossier « avatars », créé au premier envoi),
// et son adresse rangée dans le profil de connexion (user_metadata.avatar_url). Aucune table à modifier.
//   POST { image: "data:image/jpeg;base64,…" }  → enregistre (image déjà recadrée et réduite par l'appli)
//   POST { remove: true }                        → retire la photo
const BUCKET = "avatars";
const MAX = 400 * 1024;

export async function POST(request) {
  try {
    const user = await userFromRequest(request);
    if (!user) return NextResponse.json({ error: "Session expirée. Reconnectez-vous." }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const db = supabaseAdmin();
    const path = `${user.id}.jpg`;
    const meta = { ...(user.user_metadata || {}) };

    if (body.remove) {
      await db.storage.from(BUCKET).remove([path]).catch(() => {});
      delete meta.avatar_url;
      await db.auth.admin.updateUserById(user.id, { user_metadata: { ...meta, avatar_url: null } });
      return NextResponse.json({ ok: true, url: null });
    }

    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ""));
    if (!m) return NextResponse.json({ error: "Image non reconnue (JPEG, PNG ou WebP)." }, { status: 400 });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > MAX) return NextResponse.json({ error: "Image trop lourde." }, { status: 400 });

    // Dossier public « avatars » : créé automatiquement s'il n'existe pas encore
    const { error: getErr } = await db.storage.getBucket(BUCKET);
    if (getErr) {
      const { error: createErr } = await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 1024 * 1024, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] });
      if (createErr && !/already exists/i.test(createErr.message)) throw new Error("Stockage indisponible : " + createErr.message);
    }
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buf, { contentType: `image/${m[1]}`, upsert: true, cacheControl: "3600" });
    if (upErr) throw new Error("Envoi impossible : " + upErr.message);
    const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl + `?v=${Date.now()}`;
    const { error: metaErr } = await db.auth.admin.updateUserById(user.id, { user_metadata: { ...meta, avatar_url: url } });
    if (metaErr) throw new Error(metaErr.message);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    console.error("[photo de profil]", e.message);
    return NextResponse.json({ error: e.message || "Photo non enregistrée." }, { status: 500 });
  }
}
