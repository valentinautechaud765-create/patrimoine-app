"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Brand from "./components/Brand.js";
import Icon from "./components/Icon.js";
import AppView from "./components/app/AppView.js";
import { AreaChart, Donut } from "./components/Charts.js";
import { InstIcon } from "./components/app/ui.js";
import { BRAND, PLANS, TRIAL_DAYS, formatPrice } from "../lib/config.js";
import { demoData } from "../lib/demo.js";
import { supabaseBrowser, supabaseConfigured } from "../lib/supabase.js";

const FAQ = [
  ["Mes données bancaires sont-elles en sécurité ?", "La connexion à vos banques passe par Powens, prestataire agréé par l’ACPR (Banque de France). Nous ne voyons jamais vos identifiants bancaires et l’accès est en lecture seule : aucun virement n’est possible depuis l’appli."],
  ["Puis-je résilier à tout moment ?", "Oui, en deux clics depuis l’appli, sans engagement ni justification. Vous gardez l’accès jusqu’à la fin de la période payée, puis vous repassez sur la formule gratuite."],
  ["Que se passe-t-il après l’essai gratuit ?", `L’essai de Plus dure ${TRIAL_DAYS} jours et rien n’est prélevé pendant cette période. Vous recevez un rappel avant la fin ; vous pouvez annuler à tout moment avant.`],
  ["Quelles banques sont compatibles ?", "La grande majorité des banques françaises et de nombreux établissements européens : banques traditionnelles, néobanques, livrets, PEA et comptes-titres. La liste complète s’affiche au moment de connecter votre banque."],
  ["Est-ce que vous vendez mes données ?", `Non. ${BRAND.name} est financé uniquement par les abonnements. Vos données ne sont ni revendues, ni utilisées pour de la publicité.`],
  ["Ça marche sur iPhone et Android ?", "Oui. L’appli s’ouvre dans le navigateur et s’ajoute à l’écran d’accueil comme une appli classique. Elle fonctionne aussi sur ordinateur, avec un affichage pensé pour les grands écrans."],
];

const COMPARE = [
  ["Comptes bancaires synchronisés", "1", "Illimités", "Illimités"],
  ["Opérations et catégories", true, true, true],
  ["Budgets mensuels", "3", "Illimités", "Illimités"],
  ["Historique du patrimoine", "30 jours", "Complet", "Complet"],
  ["Actions, ETF, crypto", false, true, true],
  ["Analyse automatique et alertes", false, true, true],
  ["Projection jusqu’à 20 ans", false, false, true],
  ["Export CSV", false, false, true],
  ["Support prioritaire", false, false, true],
];

function Cell({ v }) {
  if (v === true) return <Icon name="check" size={17} stroke={2.4} />;
  if (v === false) return <span className="faint">—</span>;
  return <span>{v}</span>;
}

// Courbe décorative (sans montants) pour illustrer les fonctionnalités
function useCurve(n = 120, seed = 5, drift = 0.46) {
  return useMemo(() => {
    let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let v = 100; return Array.from({ length: n }, (_, i) => ({ date: String(i), value: (v += (r() - drift) * 4) }));
  }, [n, seed, drift]);
}

export default function Landing() {
  const router = useRouter();
  const [yearly, setYearly] = useState(true);
  const [demo, setDemo] = useState(null);
  const [checkingSession, setCheckingSession] = useState(supabaseConfigured);
  useEffect(() => {
    setDemo({ ...demoData(), session: null });
    if (!supabaseConfigured) return;
    const sb = supabaseBrowser();
    let active = true;
    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) router.replace("/app");
      else setCheckingSession(false);
    }).catch(() => { if (active) setCheckingSession(false); });
    const { data: auth } = sb.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/app");
    });
    return () => { active = false; auth.subscription.unsubscribe(); };
  }, [router]);
  const curve = useCurve(), proj = useCurve(60, 9, 0.3);

  if (checkingSession) return <main className="authPage"><div className="authForm"><div className="skeleton" style={{ minHeight: 220 }} /></div></main>;

  return (
    <main className="site">
      <nav className="nav"><div className="container navIn">
        <Link href="/" aria-label={BRAND.name}><Brand size={30} /></Link>
        <div className="navLinks"><a href="#fonctionnalites">Fonctionnalités</a><a href="#securite">Sécurité</a><a href="#tarifs">Tarifs</a><a href="#faq">FAQ</a></div>
        <div className="navCta"><Link className="btn ghost sm hideSm" href="/connexion">Se connecter</Link><Link className="btn primary sm" href="/connexion?mode=inscription">Commencer</Link></div>
      </div></nav>

      <section className="hero">
        <div className="container">
          <a className="announce" href="#tarifs">Essai gratuit de {TRIAL_DAYS} jours sur Plus <span>Voir les tarifs<Icon name="arrowRight" size={12} /></span></a>
          <h1 className="heroTitle">Tout votre patrimoine.<br /><span className="grad">Un seul écran.</span></h1>
          <p className="lead">Comptes courants, livrets, actions, ETF et crypto réunis automatiquement. Sachez à chaque instant combien vous possédez, où part votre argent, et où vous allez.</p>
          <div className="heroCtas">
            <Link className="btn primary lg" href="/connexion?mode=inscription">Créer mon compte gratuit<Icon name="arrowRight" size={17} /></Link>
            <Link className="btn lg" href="/app">Explorer la démo</Link>
          </div>
          <div className="heroTrust">
            <span><Icon name="check" size={15} stroke={2.4} />Formule gratuite sans limite de durée</span>
            <span><Icon name="check" size={15} stroke={2.4} />Accès bancaire en lecture seule</span>
            <span><Icon name="check" size={15} stroke={2.4} />Sans engagement</span>
          </div>
        </div>
        <div className="container">
          <div className="showcase">
            <div className="browser">
              <div className="browserBar"><i /><i /><i /><span>{BRAND.name.toLowerCase()}.app</span></div>
              <div className="browserBody">{demo ? <AppView data={demo} demo embedded /> : <div className="skeleton" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />}</div>
            </div>
            <div className="phone"><div className="phoneScreen"><span className="notch" />{demo && <AppView data={demo} demo embedded />}</div></div>
          </div>
          <p className="fictive">Aperçu réel de l’appli, avec des données de démonstration fictives.</p>
        </div>
      </section>

      <section className="section" id="fonctionnalites"><div className="container">
        <div className="sectionHead center">
          <span className="eyebrow">Fonctionnalités</span>
          <h2>Tout ce que vous possédez.<br />Enfin au même endroit.</h2>
          <p>Fini les cinq applis bancaires et le tableur à mettre à jour. {BRAND.name} rassemble tout, calcule tout, et vous montre l’essentiel.</p>
        </div>
        <div className="bento">
          <div className="tile t4">
            <span className="tileIco"><Icon name="trending" size={20} /></span>
            <h3>Votre patrimoine net, jour après jour</h3>
            <p>Une seule courbe pour tout ce que vous possédez. Glissez le doigt dessus pour revoir n’importe quel jour, sur une semaine ou depuis le début.</p>
            <div className="visual"><div className="tileChart"><AreaChart points={curve} height={150} /></div></div>
          </div>
          <div className="tile t2">
            <span className="tileIco"><Icon name="bank" size={20} /></span>
            <h3>Toutes vos banques</h3>
            <p>Connectez-les une fois : soldes et opérations arrivent ensuite tout seuls.</p>
            <div className="visual"><div className="miniList">
              {[["Banque principale", "Compte courant"], ["Banque en ligne", "Livret A"], ["Courtier", "PEA"]].map(([b, k]) => <div key={k} className="miniRow"><InstIcon name={b} size={34} /><div><b>{k}</b><small>{b}</small></div><span className="syncDot"><i />Synchro</span></div>)}
            </div></div>
          </div>
          <div className="tile t2">
            <span className="tileIco"><Icon name="target" size={20} /></span>
            <h3>Des budgets qui préviennent</h3>
            <p>Le repère blanc montre où vous devriez en être aujourd’hui. Vous savez avant de dépasser, pas après.</p>
            <div className="visual"><div className="miniBudgets">
              {[["Courses", 0.52, "#2ee59d"], ["Restaurants", 0.81, "#ffb454"], ["Transport", 0.34, "#ffb454"]].map(([c, v, col], i) => <div key={c}><div className="miniBudgetTop"><span>{c}</span><span className="muted">{Math.round(v * 100)} %</span></div><div className="bar"><i style={{ width: v * 100 + "%", background: i === 1 ? "#ffb454" : i === 0 ? "#2ee59d" : "#7fa8ff" }} /><span className="pace" style={{ left: "48%" }} /></div></div>)}
            </div></div>
          </div>
          <div className="tile t2">
            <span className="tileIco"><Icon name="pie" size={20} /></span>
            <h3>Investissements clairs</h3>
            <p>Actions, ETF, crypto : plus-values, performance et répartition, ligne par ligne.</p>
            <div className="visual" style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <Donut size={104} thickness={12} parts={[{ label: "ETF", value: 55, color: "#3d7cff" }, { label: "Actions", value: 22, color: "#7fa8ff" }, { label: "Crypto", value: 15, color: "#ffb454" }, { label: "Fonds", value: 8, color: "#b38cff" }]} />
              <div className="allocLegend">{[["ETF", "#3d7cff"], ["Actions", "#7fa8ff"], ["Crypto", "#ffb454"], ["Fonds", "#b38cff"]].map(([l, c]) => <div key={l}><i className="dot" style={{ background: c }} /><span>{l}</span></div>)}</div>
            </div>
          </div>
          <div className="tile t2">
            <span className="tileIco"><Icon name="sparkles" size={20} /></span>
            <h3>L’analyse, faite pour vous</h3>
            <p>Chaque mois, {BRAND.name} repère ce qui change dans vos dépenses et vous le dit simplement.</p>
            <div className="visual"><div className="miniInsights">
              <div><span style={{ background: "var(--warnSoft)", color: "var(--warn)" }}><Icon name="target" size={15} /></span>Restaurants : rythme élevé</div>
              <div><span style={{ background: "var(--okSoft)", color: "var(--ok)" }}><Icon name="piggy" size={15} /></span>Taux d’épargne au-dessus de 20 %</div>
            </div></div>
          </div>
          <div className="tile t3">
            <span className="tileIco"><Icon name="layers" size={20} /></span>
            <h3>Voyez où vous allez</h3>
            <p>Avec Pro, projetez votre patrimoine jusqu’à 20 ans à partir de votre vrai rythme d’épargne. Réglez l’horizon et le rendement, la courbe suit.</p>
            <div className="visual"><div className="tileChart"><AreaChart points={proj} height={120} color="#2ee59d" /></div></div>
          </div>
          <div className="tile t3">
            <span className="tileIco"><Icon name="phone" size={20} /></span>
            <h3>Sur votre téléphone, comme une vraie appli</h3>
            <p>Ajoutez {BRAND.name} à l’écran d’accueil de votre iPhone ou Android en deux gestes. Sur ordinateur, l’affichage s’adapte aux grands écrans.</p>
            <div className="visual"><div className="miniTabbar">{[["home", "Accueil"], ["wallet", "Comptes"], ["trending", "Placements"], ["target", "Budget"], ["list", "Opérations"]].map(([i, l], k) => <span key={l} className={k === 0 ? "on" : ""}><Icon name={i} size={20} />{l}</span>)}</div></div>
          </div>
        </div>
      </div></section>

      <section className="section"><div className="container">
        <div className="sectionHead center">
          <span className="eyebrow">Comment ça marche</span>
          <h2>Prêt en trois minutes.</h2>
        </div>
        <div className="steps">
          {[["Créez votre compte", "Une adresse e-mail et un mot de passe. La formule Essentiel est gratuite, sans limite de durée."],
            ["Connectez vos banques", "Choisissez votre banque et identifiez-vous sur la page sécurisée de notre partenaire agréé. Vos comptes arrivent tout seuls."],
            ["Pilotez", "Fixez vos budgets, suivez vos placements, et laissez l’appli vous prévenir quand quelque chose mérite votre attention."]].map(([t, d], i) =>
            <div className="step" key={t}><span className="stepNum">0{i + 1}</span><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </div></section>

      <section className="section" id="securite"><div className="container security">
        <div>
          <div className="sectionHead">
            <span className="eyebrow">Sécurité</span>
            <h2>Votre argent reste à vous.</h2>
            <p>{BRAND.name} lit vos comptes, rien de plus. Impossible de faire un virement ou un paiement depuis l’appli.</p>
          </div>
          <div className="secList">
            {[["eye", "Lecture seule", "L’accès bancaire permet uniquement de consulter soldes et opérations."],
              ["bank", "Partenaire agréé ACPR", "La connexion passe par Powens, agréé par l’Autorité de contrôle prudentiel (Banque de France)."],
              ["lock", "Identifiants jamais stockés chez nous", "Vous vous identifiez sur la page de votre banque, via notre partenaire. Nos accès sont chiffrés."],
              ["shield", "Données isolées, jamais revendues", "Chaque compte est cloisonné au niveau de la base de données. Aucune publicité, aucune revente."]].map(([i, t, d]) =>
              <div className="secItem" key={t}><span className="tileIco"><Icon name={i} size={19} /></span><div><b>{t}</b><span>{d}</span></div></div>)}
          </div>
        </div>
        <div className="shieldArt">
          <div className="shieldCore"><Icon name="shield" size={64} stroke={1.4} /></div>
          <span className="floatChip c1"><Icon name="lock" size={14} />Chiffré</span>
          <span className="floatChip c2"><Icon name="eye" size={14} />Lecture seule</span>
          <span className="floatChip c3"><Icon name="check" size={14} stroke={2.4} />Agréé ACPR</span>
        </div>
      </div></section>

      <section className="section" id="tarifs"><div className="container" style={{ textAlign: "center" }}>
        <div className="sectionHead center">
          <span className="eyebrow">Tarifs</span>
          <h2>Simple et transparent.</h2>
          <p>Commencez gratuitement. Passez à Plus quand vous voulez tout voir : {TRIAL_DAYS} jours offerts, sans engagement.</p>
        </div>
        <div className="billing">
          <button className={!yearly ? "on" : ""} onClick={() => setYearly(false)}>Mensuel</button>
          <button className={yearly ? "on" : ""} onClick={() => setYearly(true)}>Annuel <span className="save">−30 %</span></button>
        </div>
        <div className="plans">
          {PLANS.map((p) => {
            const price = p.monthly === 0 ? 0 : yearly ? Math.round((p.yearly / 12) * 100) / 100 : p.monthly;
            const href = p.id === "free" ? "/connexion?mode=inscription" : `/connexion?mode=inscription&plan=${p.id}&billing=${yearly ? "yearly" : "monthly"}`;
            return <div key={p.id} className={"plan" + (p.highlight ? " hl" : "")}>
              <div>
                <h3>{p.name}{p.highlight && <span className="chip blue">Recommandé</span>}</h3>
                <div className="pitch">{p.pitch}</div>
              </div>
              <div>
                <div className="price"><b>{formatPrice(price).replace(",00", "")}</b><span>/ mois</span></div>
                <div className="priceNote">{p.monthly === 0 ? "Gratuit, pour toujours" : yearly ? `${formatPrice(p.yearly)} facturés par an` : "Facturé chaque mois"}</div>
              </div>
              <Link className={"btn block lg" + (p.highlight ? " primary" : "")} href={href}>{p.cta}</Link>
              <ul>{p.features.map((f) => <li key={f}><Icon name="check" size={16} stroke={2.2} />{f}</li>)}</ul>
            </div>;
          })}
        </div>
        <div className="compare card">
          <table>
            <thead><tr><th>Comparer les formules</th>{PLANS.map((p) => <th key={p.id}>{p.name}</th>)}</tr></thead>
            <tbody>{COMPARE.map(([label, ...vals]) => <tr key={label}><td>{label}</td>{vals.map((v, i) => <td key={i}><Cell v={v} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      </div></section>

      <section className="section" id="faq"><div className="container">
        <div className="sectionHead center"><span className="eyebrow">Questions fréquentes</span><h2>Bon à savoir.</h2></div>
        <div className="faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}<Icon name="plus" size={18} /></summary><p>{a}</p></details>)}</div>
      </div></section>

      <div className="container">
        <section className="cta">
          <h2>Reprenez la main sur votre argent.</h2>
          <p>Créez votre compte en une minute. C’est gratuit pour commencer.</p>
          <div className="heroCtas">
            <Link className="btn light lg" href="/connexion?mode=inscription">Créer mon compte<Icon name="arrowRight" size={17} /></Link>
            <Link className="btn lg" href="/app">Explorer la démo</Link>
          </div>
        </section>
      </div>

      <footer className="footer"><div className="container">
        <div className="footerGrid">
          <div><Brand size={28} /><p className="muted" style={{ fontSize: 14, maxWidth: 300, marginTop: 14 }}>{BRAND.tagline} Comptes, épargne et investissements réunis dans une appli claire et sécurisée.</p></div>
          <div><h4>Produit</h4><ul><li><a href="#fonctionnalites">Fonctionnalités</a></li><li><a href="#tarifs">Tarifs</a></li><li><Link href="/app">Démo</Link></li></ul></div>
          <div><h4>Ressources</h4><ul><li><a href="#securite">Sécurité</a></li><li><a href="#faq">FAQ</a></li><li><a href={`mailto:${BRAND.supportEmail}`}>Support</a></li></ul></div>
          <div><h4>Légal</h4><ul><li><Link href="/legal/cgu">Conditions d’utilisation</Link></li><li><Link href="/legal/confidentialite">Confidentialité</Link></li><li><Link href="/legal/mentions-legales">Mentions légales</Link></li></ul></div>
        </div>
        <div className="footerBottom"><span>© {new Date().getFullYear()} {BRAND.name}</span><span>{BRAND.name} n’est pas une banque et ne fournit pas de conseil en investissement.</span></div>
      </div></footer>
    </main>
  );
}
