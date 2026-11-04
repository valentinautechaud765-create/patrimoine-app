// Réglages commerciaux centralisés : nom de marque, formules et prix.
// Changer le nom ou un prix ici le met à jour partout (site, appli, paiement).
export const BRAND = {
  name: "Patrimo",
  tagline: "Tout votre patrimoine. Un seul écran.",
  supportEmail: "support@patrimo.app",
};

export const TRIAL_DAYS = 14;

// Propriétaire de l'appli : accès complet (Pro) sans abonnement.
// Accordé uniquement côté serveur, et seulement si l'adresse e-mail a été confirmée.
export const OWNER_EMAILS = ["valentinautechaud765@gmail.com"];

// Prix en euros TTC. L'annuel correspond à environ 30 % de remise.
export const PLANS = [
  {
    id: "free",
    name: "Essentiel",
    monthly: 0,
    yearly: 0,
    pitch: "Pour démarrer et tenir son budget.",
    cta: "Commencer gratuitement",
    features: [
      "1 compte bancaire synchronisé",
      "Opérations classées par catégorie",
      "3 budgets mensuels",
      "Courbe du patrimoine sur 30 jours",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    monthly: 7.99,
    yearly: 66.99,
    highlight: true,
    pitch: "Tout votre patrimoine, au même endroit.",
    cta: `Essai gratuit ${TRIAL_DAYS} jours`,
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
    cta: "Passer à Pro",
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

export const planById = (id) => PLANS.find((p) => p.id === id) || PLANS[0];
export const formatPrice = (n) => n === 0 ? "0 €" : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
