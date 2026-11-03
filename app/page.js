"use client";
import { useState } from "react";
import Link from "next/link";
import Logo from "./Logo.js";
import { BRAND, PLANS, TRIAL_DAYS, formatPrice } from "../lib/config.js";

const FEATURES = [
  ["◎", "Tout au même endroit", "Comptes courants, livrets, PEA, assurance-vie, actions, ETF et crypto : votre patrimoine complet, mis à jour automatiquement."],
  ["⌁", "Courbes en temps réel", "Suivez la valeur de vos placements à la minute, comparez les périodes et voyez exactement d’où viennent vos gains."],
  ["⇄", "Synchronisation bancaire", "Connectez vos banques en 2 minutes via notre partenaire agréé. Vos opérations arrivent toutes seules, déjà catégorisées."],
  ["◷", "Budgets qui vous parlent", "Plafonds par catégorie, reste à dépenser par jour et alertes avant de dépasser, pas après."],
  ["↻", "Paiements à venir", "Loyer, salaire, abonnements : voyez la semaine qui arrive et ne soyez plus jamais surpris par un prélèvement."],
  ["▦", "Widget iPhone", "Votre patrimoine sur l’écran d’accueil, sans même ouvrir l’appli."],
];
const FAQ = [
  ["Mes données bancaires sont-elles en sécurité ?", "La connexion à vos banques passe par Powens, prestataire agréé par l’ACPR (Banque de France). Nous n’avons jamais accès à vos identifiants bancaires, et l’accès est uniquement en lecture : aucun virement n’est possible depuis l’appli."],
  ["Puis-je résilier à tout moment ?", "Oui, en un clic depuis l’appli, sans engagement. Vous gardez l’accès jusqu’à la fin de la période payée."],
  ["Que se passe-t-il après l’essai gratuit ?", `L’essai dure ${TRIAL_DAYS} jours. Vous êtes prévenu avant la fin ; sans action de votre part, vous passez automatiquement à la formule choisie. Vous pouvez aussi revenir à la formule gratuite.`],
  ["Quelles banques sont compatibles ?", "La grande majorité des banques françaises et de nombreux établissements européens : banques traditionnelles, néobanques, courtiers et plateformes d’investissement. La liste complète s’affiche au moment de connecter votre banque."],
  ["L’appli fonctionne-t-elle sur iPhone et Android ?", "Oui. Elle s’installe sur l’écran d’accueil depuis le navigateur, et fonctionne aussi sur ordinateur."],
];

export default function Landing() {
  const [yearly, setYearly] = useState(true);
  return (
    <main className="glow">
      <nav className="nav"><div className="wrap navIn">
        <Logo />
        <div className="navLinks"><a href="#fonctions">Fonctionnalités</a><a href="#securite">Sécurité</a><a href="#tarifs">Tarifs</a><a href="#faq">FAQ</a></div>
        <div className="navCta"><Link className="btn small" href="/connexion">Se connecter</Link><Link className="btn small primary" href="/connexion?mode=inscription">Essai gratuit</Link></div>
      </div></nav>

      <section className="hero wrap">
        <span className="pill">Nouveau · Cours en direct et widget iPhone</span>
        <h1>Tout votre patrimoine.<br /><em>Un seul écran.</em></h1>
        <p className="lead">Banques, épargne, actions, ETF et crypto réunis et mis à jour en temps réel. Sachez enfin, à chaque instant, combien vous possédez vraiment, et où va votre argent.</p>
        <div className="heroCtas">
          <Link className="btn primary" href="/connexion?mode=inscription">Commencer l’essai gratuit</Link>
          <Link className="btn" href="/app">Voir la démo →</Link>
        </div>
        <p className="heroNote">{TRIAL_DAYS} jours gratuits · Sans engagement · Résiliable en un clic</p>

        <div className="mock" aria-hidden="true">
          <div className="mockFrame">
            <div className="mockTop">
              <div><span className="eyebrow">Patrimoine total</span><div className="mockAmount num">48 312<small>,57 €</small></div><span className="ok">▲ +2 184,30 € · +4,73 %</span> <span className="muted">sur 1 an</span></div>
              <div className="mockChips"><span className="pill">1J</span><span className="pill">1M</span><span className="pill" style={{ background: "rgba(61,124,255,.3)", color: "#fff" }}>1A</span><span className="pill">Tout</span></div>
            </div>
            <svg viewBox="0 0 900 180" width="100%" height="180" preserveAspectRatio="none" style={{ display: "block", marginTop: 20 }}>
              <defs><linearGradient id="mg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3d7cff" stopOpacity=".35" /><stop offset="1" stopColor="#3d7cff" stopOpacity="0" /></linearGradient></defs>
              <path d="M0 150 C80 140 120 120 180 128 S300 96 360 104 S470 70 540 80 S660 40 720 52 S840 18 900 22 L900 180 L0 180 Z" fill="url(#mg)" />
              <path d="M0 150 C80 140 120 120 180 128 S300 96 360 104 S470 70 540 80 S660 40 720 52 S840 18 900 22" fill="none" stroke="#5c95ff" strokeWidth="2.5" />
            </svg>
            <div className="mockGrid">
              <div className="mockTile"><span>Comptes bancaires</span><b className="num">6 940,12 €</b></div>
              <div className="mockTile"><span>Investissements</span><b className="num">31 208,45 €</b></div>
              <div className="mockTile"><span>Épargne</span><b className="num">10 164,00 €</b></div>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "14px 0 0" }}>Illustration avec des montants fictifs.</p>
          </div>
        </div>
      </section>

      <section id="fonctions" className="section wrap center">
        <span className="eyebrow">Fonctionnalités</span>
        <h2>Moins de tableaux Excel.<br />Plus de décisions éclairées.</h2>
        <p className="sub">Tout ce qu’il faut pour piloter son argent comme un pro, sans y passer ses soirées.</p>
        <div className="features">{FEATURES.map(([ico, t, d]) => <div className="card feature" key={t} style={{ textAlign: "left" }}><div className="ico">{ico}</div><h3>{t}</h3><p>{d}</p></div>)}</div>
      </section>

      <section id="securite" className="section wrap">
        <div className="split">
          <div>
            <span className="eyebrow">Sécurité</span>
            <h2>Vos données restent les vôtres.</h2>
            <p className="sub">Nous avons conçu {BRAND.name} pour qu’on puisse lui confier ce qu’on a de plus personnel.</p>
            <ul className="checks">
              <li>Connexion bancaire via Powens, agréé par l’ACPR (Banque de France)</li>
              <li>Accès en lecture seule : aucun mouvement d’argent possible</li>
              <li>Vos identifiants bancaires ne transitent jamais par nos serveurs</li>
              <li>Données chiffrées et hébergées en Europe</li>
              <li>Vos données ne sont ni vendues ni partagées. Jamais.</li>
            </ul>
          </div>
          <div className="card" style={{ padding: 28 }}>
            <span className="eyebrow">Ce que vous voyez chaque matin</span>
            <div style={{ display: "grid", gap: 2, marginTop: 14 }}>
              {[["R", "Compte courant", "Banque", "2 418,30 €", null], ["L", "Livret A", "Épargne", "8 500,00 €", null], ["VW", "ETF Monde", "PEA · 42 parts", "5 912,64 €", 8.4], ["AA", "Apple", "Compte-titres", "1 204,10 €", -2.1]].map(([i, n, s, v, p]) =>
                <div className="row" key={n}><span className="rowIco">{i}</span><span className="rowMain"><b>{n}</b><small>{s}</small></span><span className="rowSide"><b>{v}</b>{p !== null && <span className={"tag " + (p >= 0 ? "up" : "down")}>{p >= 0 ? "▲ +" : "▼ "}{Math.abs(p).toFixed(1).replace(".", ",")} %</span>}</span></div>)}
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>Exemple avec des montants fictifs.</p>
          </div>
        </div>
      </section>

      <section id="tarifs" className="section wrap center">
        <span className="eyebrow">Tarifs</span>
        <h2>Un prix simple. Sans surprise.</h2>
        <p className="sub">Commencez gratuitement. Passez à Plus quand vous voulez voir tout votre patrimoine.</p>
        <div className="billing"><button className={!yearly ? "on" : ""} onClick={() => setYearly(false)}>Mensuel</button><button className={yearly ? "on" : ""} onClick={() => setYearly(true)}>Annuel<span className="save">−30 %</span></button></div>
        <div className="plans">{PLANS.map(p => {
          const price = yearly ? p.yearly / 12 : p.monthly;
          return <div key={p.id} className={"card plan" + (p.highlight ? " hl" : "")}>
            {p.highlight && <span className="pill badge" style={{ background: "#3d7cff", color: "#fff", borderColor: "#3d7cff" }}>Le plus choisi</span>}
            <div><h3>{p.name}</h3><div className="pitch">{p.pitch}</div></div>
            <div><div className="price"><b className="num">{formatPrice(Math.round(price * 100) / 100)}</b><span>/ mois</span></div>
              <div className="muted" style={{ fontSize: 13, minHeight: 20 }}>{p.monthly === 0 ? "Gratuit pour toujours" : yearly ? `Facturé ${formatPrice(p.yearly)} par an` : "Facturé chaque mois"}</div></div>
            <Link className={"btn block" + (p.highlight ? " primary" : "")} href={`/connexion?mode=inscription&plan=${p.id}&billing=${yearly ? "yearly" : "monthly"}`}>{p.id === "plus" ? `Essai gratuit ${TRIAL_DAYS} jours` : p.cta}</Link>
            <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>
          </div>;
        })}</div>
        <p className="muted" style={{ fontSize: 13, marginTop: 18 }}>Prix TTC. Sans engagement, résiliable en un clic.</p>
      </section>

      <section id="faq" className="section wrap center">
        <span className="eyebrow">Questions fréquentes</span>
        <h2>Tout ce que vous voulez savoir.</h2>
        <div className="faq" style={{ textAlign: "left" }}>{FAQ.map(([q, a]) => <details className="card" key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </section>

      <section className="section wrap">
        <div className="final">
          <h2 style={{ margin: "0 0 10px" }}>Votre patrimoine mérite mieux qu’un tableur.</h2>
          <p className="sub" style={{ margin: "0 auto 26px" }}>Rejoignez {BRAND.name} et voyez tout votre argent, en temps réel, en 2 minutes.</p>
          <Link className="btn white" href="/connexion?mode=inscription">Commencer gratuitement</Link>
        </div>
      </section>

      <footer className="footer"><div className="wrap footerIn">
        <span>© {new Date().getFullYear()} {BRAND.name}</span>
        <span style={{ display: "flex", gap: 18, flexWrap: "wrap" }}><Link href="/legal/cgu">Conditions d’utilisation</Link><Link href="/legal/confidentialite">Confidentialité</Link><Link href="/legal/mentions-legales">Mentions légales</Link><a href={`mailto:${BRAND.supportEmail}`}>Contact</a></span>
      </div></footer>
    </main>
  );
}
