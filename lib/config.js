// Réglages commerciaux centralisés : nom de marque, formules et prix.
// Changer le nom ou un prix ici le met à jour partout (site, appli, paiement).
export const BRAND = {
  name: "Patrimo",
  tagline: "Tout votre patrimoine. Un seul écran.",
  supportEmail: "support@patrimo.app",
};

export const TRIAL_DAYS = 14;

// Prix en euros TTC. L'annuel correspond à environ 30 % de remise.
export const PLANS = [
  {
    id: "free",
    name: "Essentiel",
    monthly: 0,
    yearly: 0,
    pitch: "Pour démarrer et suivre son budget.",
    cta: "Commencer gratuitement",
    features: [
      "1 compte bancaire synchronisé",
      "Budget du mois et catégories",
      "Suivi manuel de l’épargne",
      "Courbe du patrimoine sur 30 jours",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    monthly: 7.99,
    yearly: 66.99,
    highlight: true,
    pitch: "Le patrimoine complet, en temps réel.",
    cta: `Essai gratuit ${14} jours`,
    features: [
      "Comptes bancaires illimités",
      "Actions, ETF et crypto au cours en direct",
      "Historique complet et courbes détaillées",
      "Budgets, opérations automatiques, remboursements",
      "Widget iPhone",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 14.99,
    yearly: 124.99,
    pitch: "Pour les investisseurs exigeants.",
    cta: "Passer à Pro",
    features: [
      "Tout Plus, et :",
      "Dividendes, performance comparée aux indices",
      "Projections de patrimoine et objectifs",
      "Export comptable et aide à la déclaration",
      "Support prioritaire",
    ],
  },
];

export const planById = (id) => PLANS.find((p) => p.id === id) || PLANS[0];
export const formatPrice = (n) => n === 0 ? "0 €" : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
