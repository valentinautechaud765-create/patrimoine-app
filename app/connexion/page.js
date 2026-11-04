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
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [info, setInfo] = useState(""), [sent, setSent] = useState(""), [unconfirmed, setUnconfirmed] = useState(false);
  const plan = params.get("plan"), billing = params.get("billing") || "yearly";
  const chosen = plan && plan !== "free" ? planById(plan) : null;

  // Déjà connecté : direction l'appli.
  // Retour du lien de confirmation : Supabase ouvre la session automatiquement.
  useEffect(() => {
    const sb = supabaseBrowser(); if (!sb) return;
    sb.auth.getSession().then(({ data }) => { if (data.session) router.replace(chosen ? `/app?souscrire=${chosen.id}&billing=${billing}` : "/app"); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => { if (session) router.replace("/app"); });
    if (params.get("confirme")) setInfo("Adresse confirmée. Vous pouvez vous connecter.");
    return () => sub.subscription.unsubscribe();
  }, [router]); // eslint-disable-line

  const next = () => router.push(chosen ? `/app?souscrire=${chosen.id}&billing=${billing}` : "/app");

  async function submit(e) {
    e.preventDefault(); setError(""); setInfo(""); setUnconfirmed(false);
    const sb = supabaseBrowser();
    if (!sb) { next(); return; } // Mode démo : pas encore de base de données configurée.
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name.trim() }, emailRedirectTo: redirectTo() } });
        if (error) throw error;
        if (!data.session) { setSent(email); return; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      next();
    } catch (err) {
      if (/not confirmed/i.test(err.message)) { setUnconfirmed(true); setError("Votre adresse e-mail n’est pas encore confirmée. Ouvrez l’e-mail de confirmation que nous vous avons envoyé (pensez aux spams), puis reconnectez-vous."); return; }
      setError(/invalid login/i.test(err.message) ? "E-mail ou mot de passe incorrect." : /already registered/i.test(err.message) ? "Un compte existe déjà avec cette adresse. Connectez-vous." : /rate limit/i.test(err.message) ? "Trop de tentatives. Patientez quelques minutes puis réessayez." : /password/i.test(err.message) ? "Mot de passe trop faible : 10 caractères minimum." : err.message);
    } finally { setBusy(false); }
  }
  const redirectTo = () => window.location.origin + "/connexion?confirme=1" + (chosen ? `&plan=${chosen.id}&billing=${billing}` : "");
  async function resend(target) {
    setError(""); setInfo("");
    const { error } = await supabaseBrowser().auth.resend({ type: "signup", email: target, options: { emailRedirectTo: redirectTo() } });
    setInfo(error ? (/rate limit|seconds/i.test(error.message) ? "Un e-mail vient déjà de partir. Patientez une minute avant de redemander." : error.message) : "Nouvel e-mail envoyé. Regardez aussi dans les spams.");
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

  if (sent) return (
    <main className="authPage">
      <div className="authForm">
        <div className="authBox">
          <Link href="/" aria-label="Accueil"><Brand size={32} /></Link>
          <div className="mailSent">
            <span className="mailIco"><Icon name="mail" size={26} /></span>
            <h1>Vérifiez votre boîte mail</h1>
            <p>Nous venons d’envoyer un lien de confirmation à <b>{sent}</b>.</p>
            <ol className="mailSteps">
              <li><span>1</span><div>Ouvrez l’e-mail de confirmation, envoyé par « Supabase Auth » (regardez aussi dans les <b>spams</b>).</div></li>
              <li><span>2</span><div>Cliquez sur le lien de confirmation qu’il contient.</div></li>
              <li><span>3</span><div>Vous arrivez directement dans votre espace {BRAND.name}.</div></li>
            </ol>
          </div>
          {info && <div className="msg info">{info}</div>}
          <button className="btn primary lg block" onClick={() => { setSent(""); setMode("login"); setInfo(""); }}>J’ai confirmé, me connecter</button>
          <button className="btn block" onClick={() => resend(sent)}>Renvoyer l’e-mail</button>
          <p className="legalNote">Mauvaise adresse ? <button type="button" className="link" style={{ fontSize: 12 }} onClick={() => { setSent(""); setInfo(""); }}>Recommencer l’inscription</button></p>
        </div>
      </div>
      <aside className="authSide" />
    </main>
  );

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
          {error && <div className="msg err">{error}{unconfirmed && email && <> <button type="button" className="link" onClick={() => resend(email)}>Renvoyer l’e-mail</button></>}</div>}
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
