"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Logo from "../Logo.js";
import { supabaseBrowser, supabaseConfigured } from "../../lib/supabase.js";
import { TRIAL_DAYS } from "../../lib/config.js";

function AuthForm() {
  const params = useSearchParams(), router = useRouter();
  const [mode, setMode] = useState(params.get("mode") === "inscription" ? "signup" : "login");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [name, setName] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [info, setInfo] = useState("");
  const plan = params.get("plan"), billing = params.get("billing") || "yearly";

  // Déjà connecté : direction l'appli.
  useEffect(() => { const sb = supabaseBrowser(); sb?.auth.getSession().then(({ data }) => { if (data.session) router.replace("/app"); }); }, [router]);

  const next = () => router.push(plan && plan !== "free" ? `/app?souscrire=${plan}&billing=${billing}` : "/app");

  async function submit(e) {
    e.preventDefault(); setError(""); setInfo("");
    const sb = supabaseBrowser();
    if (!sb) { next(); return; } // Mode démo : pas encore de base de données configurée.
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (error) throw error;
        if (!data.session) { setInfo("Compte créé ! Confirme ton adresse grâce à l’e-mail que nous venons d’envoyer, puis connecte-toi."); return; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      next();
    } catch (err) {
      setError(/invalid login/i.test(err.message) ? "E-mail ou mot de passe incorrect." : err.message);
    } finally { setBusy(false); }
  }
  async function reset() {
    const sb = supabaseBrowser();
    if (!sb || !email) { setError("Indique ton e-mail pour recevoir un lien de réinitialisation."); return; }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/connexion" });
    setInfo("Si un compte existe, un e-mail de réinitialisation vient d’être envoyé.");
  }

  return (
    <main className="auth glow">
      <form className="card authBox" onSubmit={submit}>
        <Link href="/"><Logo /></Link>
        <h1>{mode === "signup" ? "Créer ton compte" : "Bon retour 👋"}</h1>
        <p className="muted" style={{ margin: 0 }}>{mode === "signup" ? `${TRIAL_DAYS} jours d’essai gratuit, sans engagement.` : "Connecte-toi pour retrouver ton patrimoine."}</p>
        <div className="tabs2"><button type="button" className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>Connexion</button><button type="button" className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>Inscription</button></div>
        {!supabaseConfigured && <div className="msg info">Mode démonstration : la base de données n’est pas encore branchée. Tu peux entrer n’importe quoi pour découvrir l’appli.</div>}
        {mode === "signup" && <input className="input" placeholder="Prénom" value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" />}
        <input className="input" type="email" placeholder="Adresse e-mail" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required={supabaseConfigured} />
        <input className="input" type="password" placeholder={mode === "signup" ? "Mot de passe (10 caractères min.)" : "Mot de passe"} minLength={mode === "signup" && supabaseConfigured ? 10 : undefined} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} required={supabaseConfigured} />
        {error && <div className="msg err">{error}</div>}
        {info && <div className="msg info">{info}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "Patiente…" : mode === "signup" ? "Créer mon compte" : "Se connecter"}</button>
        {mode === "login" && <button type="button" className="btn block" onClick={reset}>Mot de passe oublié</button>}
        <p className="muted" style={{ fontSize: 12, margin: 0, textAlign: "center" }}>En continuant, tu acceptes les <Link href="/legal/cgu" style={{ textDecoration: "underline" }}>conditions d’utilisation</Link> et la <Link href="/legal/confidentialite" style={{ textDecoration: "underline" }}>politique de confidentialité</Link>.</p>
      </form>
    </main>
  );
}
export default function Page() { return <Suspense fallback={null}><AuthForm /></Suspense>; }
