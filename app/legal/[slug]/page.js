import Link from "next/link";
import { notFound } from "next/navigation";
import Brand from "../../components/Brand.js";
import { BRAND } from "../../../lib/config.js";

// MODÈLES À FAIRE RELIRE PAR UN PROFESSIONNEL avant le lancement commercial.
const PAGES = {
  "cgu": ["Conditions générales d’utilisation", [
    ["Objet", `${BRAND.name} est un service en ligne d’agrégation et de suivi de patrimoine. Il fournit des informations à titre indicatif et ne constitue pas un conseil en investissement.`],
    ["Abonnements", "Les formules payantes sont sans engagement, renouvelées automatiquement chaque mois ou chaque année, et résiliables à tout moment depuis l’espace client. L’essai gratuit n’est accordé qu’une fois par compte."],
    ["Droit de rétractation", "Conformément au Code de la consommation, vous disposez de 14 jours pour vous rétracter après la souscription. [À compléter selon le choix retenu : exécution immédiate et renonciation expresse, ou remboursement.]"],
    ["Responsabilité", "Les données bancaires et de marché proviennent de prestataires tiers. Malgré notre vigilance, elles peuvent comporter des retards ou des erreurs."],
    ["Éditeur", "[Raison sociale, forme juridique, capital, SIREN, adresse, directeur de la publication — à compléter.]"],
  ]],
  "confidentialite": ["Politique de confidentialité", [
    ["Données collectées", "Adresse e-mail, prénom, données de comptes et d’opérations importées avec votre accord, données d’abonnement."],
    ["Finalités", "Fournir le service, gérer votre abonnement, assurer la sécurité. Vos données ne sont jamais vendues ni utilisées à des fins publicitaires."],
    ["Sous-traitants", "Supabase (hébergement des données, région Union européenne), Stripe (paiement), Powens (connexion bancaire, agréé ACPR), Vercel (hébergement du site)."],
    ["Durée de conservation", "Pendant la durée du compte, puis suppression sous 30 jours après sa clôture, sauf obligations légales (facturation : 10 ans)."],
    ["Vos droits", `Accès, rectification, effacement, portabilité et opposition : écrivez à ${BRAND.supportEmail}. Vous pouvez saisir la CNIL.`],
  ]],
  "mentions-legales": ["Mentions légales", [
    ["Éditeur", "[Raison sociale, adresse, SIREN, e-mail, directeur de la publication — à compléter.]"],
    ["Hébergement", "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis."],
    ["Contact", BRAND.supportEmail],
  ]],
};

export function generateStaticParams() { return Object.keys(PAGES).map(slug => ({ slug })); }

export default function Legal({ params }) {
  const page = PAGES[params.slug];
  if (!page) notFound();
  return <main className="legal"><div className="container legalIn">
    <Link href="/" aria-label="Accueil"><Brand size={30} /></Link>
    <h1>{page[0]}</h1>
    <p className="muted" style={{ fontSize: 13 }}>Dernière mise à jour : à compléter</p>
    {page[1].map(([t, p]) => <section key={t}><h2>{t}</h2><p>{p}</p></section>)}
    <nav className="legalNav">{Object.entries(PAGES).map(([slug, [title]]) => <Link key={slug} href={`/legal/${slug}`} className={slug === params.slug ? "on" : ""}>{title}</Link>)}</nav>
  </div></main>;
}
