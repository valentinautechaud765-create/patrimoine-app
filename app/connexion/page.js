"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Brand from "../components/Brand.js";
import Icon from "../components/Icon.js";
import { supabaseBrowser, supabaseConfigured } from "../../lib/supabase.js";
import { BRAND, TRIAL_DAYS, planById } from "../../lib/config.js";

function AuthForm() {
  const params = useSearchParams(), router = useRouter();
  const [mode, setMode] = useState(params.get("mode") === "inscription" ? "signup" : "login");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [name, setName] = useState(""), [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [info, setInfo] = useState("");
  const plan = params.get("plan"), billing = params.get("billing") || "yearly";
  const chosen = plan && plan !== "free" ? planById(plan) : null;

  // Déjà connecté : direction l'appli.
  useEffect(() => { supabaseBrowser()?.auth.getSession().then(({ data }) => { if (data.session) router.replace("/app"); }); }, [router]);

  const next = () => router.push(chosen ? `/app?souscrire=${chosen.id}&billing=${billing}` : "/app");

  async function submit(e) {
    e.preventDefault(); setError(""); setInfo("");
    const sb = supabaseBrowser();
    if (!sb) { next(); return; } // Mode démo : pas encore de base de données configurée.
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } });
        if (error) throw error;
        if (!data.session) { setInfo("Compte créé. Confirmez votre adresse grâce à l’e-mail que nous venons d’envoyer, puis connectez-vous."); setMode("login"); return; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      next();
    } catch (err) {
      setError(/invalid login/i.test(err.message) ? "E-mail ou mot de passe incorrect." : /already registered/i.test(err.message) ? "Un compte existe déjà avec cette adresse. Connectez-vous." : err.message);
    } finally { setBusy(false); }
  }
  async function reset() {
    setError(""); setInfo("");
    const sb = supabaseBrowser();
    if (!sb) { setInfo("Démonstration : aucun e-mail n’est envoyé."); return; }
    if (!email) { setError("Indiquez votre e-mail pour recevoir un lien de réinitialisation."); return; }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/connexion" });
    setInfo("Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé.");
  }
  const signup = mode === "signup";

  return (
    <main className="authPage">
      <div className="authForm">
        <form className="authBox" onSubmit={submit}>
          <Link href="/" aria-label="Accueil"><Brand size={32} /></Link>
          <div>
            <h1>{signup ? "Créer votre compte" : "Bon retour"}</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>{signup ? (chosen ? `Puis activez ${chosen.name}${chosen.id === "plus" ? ` : ${TRIAL_DAYS} jours offerts` : ""}.` : "Gratuit, sans carte bancaire.") : `Connectez-vous pour retrouver votre patrimoine.`}</p>
          </div>
          {chosen && signup && <div className="chosenPlan"><Icon name="sparkles" size={16} /><span>Formule choisie : <b>{chosen.name}</b> · {billing === "monthly" ? "mensuel" : "annuel"}</span></div>}
          {!supabaseConfigured && <div className="msg info">Mode démonstration : la base de données n’est pas encore branchée. Continuez sans rien remplir pour découvrir l’appli.</div>}
          {signup && <label className="label">Prénom<input className="input" placeholder="Votre prénom" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>}
          <label className="label">Adresse e-mail<input className="input" type="email" placeholder="vous@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required={supabaseConfigured} /></label>
          <label className="label">
            <span className="labelRow">Mot de passe{!signup && <button type="button" className="link" onClick={reset}>Oublié ?</button>}</span>
            <span className="pwField">
              <input className="input" type={show ? "text" : "password"} placeholder={signup ? "10 caractères minimum" : "••••••••••"} minLength={signup && supabaseConfigured ? 10 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={signup ? "new-password" : "current-password"} required={supabaseConfigured} />
              <button type="button" className="pwToggle" onClick={() => setShow(!show)} aria-label={show ? "Masquer" : "Afficher"}><Icon name="eye" size={17} /></button>
            </span>
          </label>
          {error && <div className="msg err">{error}</div>}
          {info && <div className="msg info">{info}</div>}
          <button className="btn primary lg block" disabled={busy}>{busy ? "Un instant…" : signup ? "Créer mon compte" : "Se connecter"}<Icon name="arrowRight" size={17} /></button>
          <p className="switchMode">{signup ? "Déjà un compte ?" : "Pas encore de compte ?"} <button type="button" className="link" onClick={() => { setMode(signup ? "login" : "signup"); setError(""); setInfo(""); }}>{signup ? "Se connecter" : "Créer un compte"}</button></p>
          <p className="legalNote">En continuant, vous acceptez les <Link href="/legal/cgu">conditions d’utilisation</Link> et la <Link href="/legal/confidentialite">politique de confidentialité</Link>.</p>
        </form>
      </div>
      <aside className="authSide">
        <div className="authQuote">
          <span className="eyebrow">{BRAND.name}</span>
          <h2>Tout votre patrimoine. Un seul écran.</h2>
          <div className="authPoints">
            {[["bank", "Toutes vos banques réunies", "Soldes et opérations synchronisés automatiquement."],
              ["trending", "Une courbe, tout votre patrimoine", "Comptes, épargne et placements, jour après jour."],
              ["target", "Des budgets qui préviennent", "Vous savez avant de dépasser, pas après."],
              ["shield", "Lecture seule, partenaire agréé ACPR", "Aucun virement possible depuis l’appli."]].map(([i, t, d]) =>
              <div key={t} className="authPoint"><span className="tileIco"><Icon name={i} size={18} /></span><div><b>{t}</b><small>{d}</small></div></div>)}
          </div>
        </div>
      </aside>
    </main>
  );
}
export default function Page() { return <Suspense fallback={null}><AuthForm /></Suspense>; }
