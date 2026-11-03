import Link from "next/link";
import { notFound } from "next/navigation";
import Logo from "../../Logo.js";
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
  return <main className="glow" style={{ minHeight: "100vh" }}><div className="wrap" style={{ maxWidth: 760, padding: "30px 0 80px" }}>
    <Link href="/"><Logo /></Link>
    <h1 style={{ fontWeight: 600, letterSpacing: "-.02em", margin: "36px 0 8px" }}>{page[0]}</h1>
    <p className="muted" style={{ fontSize: 13 }}>Dernière mise à jour : à compléter</p>
    {page[1].map(([t, p]) => <section key={t} style={{ marginTop: 26 }}><h2 style={{ fontSize: 18, fontWeight: 600 }}>{t}</h2><p className="muted">{p}</p></section>)}
  </div></main>;
}
