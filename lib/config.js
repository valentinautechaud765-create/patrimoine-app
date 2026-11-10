// Réglages commerciaux centralisés : nom de marque, formules et prix.
// Changer le nom ou un prix ici le met à jour partout (site, appli, paiement).
export const BRAND = {
  name: "Patrimo",
  tagline: "Tout votre patrimoine. Un seul écran.",
  supportEmail: "support@patrimo.app",
};

// Découverte : à l'inscription, tout est débloqué pendant TRIAL_DAYS jours, sans carte bancaire.
// Ensuite, un abonnement est nécessaire pour continuer (les données restent gardées).
export const TRIAL_DAYS = 3;

// Propriétaire de l'appli : accès complet (Pro) sans abonnement.
// Accordé uniquement côté serveur, et seulement si l'adresse e-mail a été confirmée.
export const OWNER_EMAILS = ["valentinautechaud765@gmail.com", "yfedhili@gmail.com"];

// Prix en euros TTC. L'annuel correspond à environ 30 % de remise.
export const PLANS = [
  {
    id: "free",
    name: "Découverte",
    hidden: true,
    monthly: 0,
    yearly: 0,
    pitch: `${TRIAL_DAYS} jours pour tout essayer.`,
    cta: "Essayer gratuitement",
    features: [],
  },
  {
    id: "plus",
    name: "Plus",
    monthly: 7.99,
    yearly: 66.99,
    highlight: true,
    pitch: "Tout votre patrimoine, au même endroit.",
    cta: `Essayer ${TRIAL_DAYS} jours gratuits`,
    features: [
      "Comptes bancaires illimités",
      "Actions, ETF et crypto : plus-values et répartition",
      "Historique complet du patrimoine",
      "Budgets illimités avec alerte de rythme",
      "Analyse automatique de vos dépenses",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 14.99,
    yearly: 124.99,
    pitch: "Pour piloter son patrimoine sur le long terme.",
    cta: `Essayer ${TRIAL_DAYS} jours gratuits`,
    features: [
      "Tout Plus, et :",
      "Projection du patrimoine jusqu’à 20 ans",
      "Export CSV de toutes vos opérations",
      "Support prioritaire par e-mail",
      "Accès en avant-première aux nouveautés",
    ],
  },
];

// Ce que chaque formule débloque (utilisé par l'appli pour afficher les verrous).
export const LIMITS = {
  free: { accounts: 1, budgets: 3, historyDays: 30, investments: false, insights: false, projection: false, export: false },
  plus: { accounts: Infinity, budgets: Infinity, historyDays: Infinity, investments: true, insights: true, projection: false, export: false },
  pro: { accounts: Infinity, budgets: Infinity, historyDays: Infinity, investments: true, insights: true, projection: true, export: true },
};
export const limitsFor = (plan) => LIMITS[plan] || LIMITS.free;

// Accès réel d'un compte : abonnement payé, essai de découverte en cours, ou essai terminé (verrouillé).
// L'essai part de la date de création du compte (profiles.created_at) : rien à stocker, rien à falsifier côté navigateur.
export function accessFor(profile = {}, now = Date.now()) {
  const p = profile || {};
  if (["plus", "pro"].includes(p.plan) && ["active", "trialing", "past_due", null, undefined, ""].includes(p.plan_status)) return { plan: p.plan, paid: true, locked: false };
  const start = p.created_at ? new Date(p.created_at).getTime() : now;
  const end = start + TRIAL_DAYS * 864e5, left = end - now;
  if (left > 0) return { plan: "plus", trial: true, locked: false, msLeft: left, daysLeft: Math.ceil(left / 864e5), hoursLeft: Math.ceil(left / 36e5), trialEnd: new Date(end).toISOString() };
  return { plan: "free", locked: true, trialEnd: new Date(end).toISOString() };
}

export const planById = (id) => PLANS.find((p) => p.id === id) || PLANS[0];
export const formatPrice = (n) => n === 0 ? "0 €" : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
