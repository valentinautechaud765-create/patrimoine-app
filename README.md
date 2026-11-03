# Patrimo — gestion de patrimoine par abonnement

Appli web (installable sur iPhone / Android) qui réunit comptes bancaires, épargne et investissements, avec courbe du patrimoine, budgets et abonnement payant.

> Le nom « Patrimo » est provisoire : il se change en une ligne dans `lib/config.js`. Vérifier sur l’INPI que le nom choisi est libre avant le lancement.

## Offre et prix (dans `lib/config.js`)

| Formule | Mensuel | Annuel (≈ −30 %) | Pour qui |
|---|---|---|---|
| Essentiel | 0 € | 0 € | Découvrir : 1 compte, budget, 30 jours d’historique |
| **Plus** (mise en avant) | **7,99 €** | 66,99 € | Banques illimitées, investissements, analyse automatique — 14 jours d’essai gratuit |
| Pro | 14,99 € | 124,99 € | Investisseurs : dividendes, projections, export, support prioritaire |

Pourquoi ces prix : Finary et les applis équivalentes se situent entre ~8 et ~15 €/mois. Un nouvel entrant convertit mieux légèrement sous le leader. L’annuel mis en avant améliore la trésorerie et réduit les résiliations. L’essai gratuit sans carte est remplacé ici par un essai **avec carte** via Stripe : moins d’inscrits, mais beaucoup plus de clients payants.

## Ce qui est prêt

- **Site commercial** (`/`) : accroche, fonctionnalités, sécurité, tarifs mensuel/annuel, FAQ, appels à l’action.
- **Connexion / inscription** (`/connexion`) avec Supabase (e-mail + mot de passe, réinitialisation).
- **Appli** (`/app`) : patrimoine total avec courbe interactive, comptes, investissements, budgets, opérations, ajout d’opération.
- **Paywall** : fonctions réservées aux abonnés (historique complet, investissements, plusieurs banques) avec fenêtre d’abonnement.
- **Abonnements Stripe** : paiement, essai gratuit unique, espace client (factures, changement de formule, résiliation), webhook qui met à jour la formule.
- **Connexion bancaire Powens** : ouverture de la page de connexion, import des comptes au retour, jeton chiffré.
- **Base de données** `supabase/schema.sql` : tables, sécurité RLS (chacun ne voit que ses données), photo quotidienne du patrimoine.
- **Pages légales** (`/legal/...`) : modèles à compléter et à faire relire.

Sans configuration, tout fonctionne en **mode démo** (montants fictifs signalés à l’écran).

## Mise en ligne, étape par étape

1. **Vercel** : *Add New → Project* → importer `patrimoine-app` → *Deploy*. Le site est en ligne en mode démo.
2. **Supabase** (supabase.com, gratuit pour démarrer) : créer un projet en **région Europe (Francfort ou Paris)** → *SQL Editor* → coller `supabase/schema.sql` → *Run*. Récupérer dans *Project Settings → API* : URL, clé `anon`, clé `service_role`.
3. **Stripe** (stripe.com) :
   - *Produits* → créer « Plus » (prix 7,99 € / mois et 66,99 € / an) et « Pro » (14,99 € / mois et 124,99 € / an), copier les 4 identifiants `price_…`.
   - *Développeurs → Webhooks* → ajouter `https://VOTRE-SITE/api/stripe/webhook` avec les évènements `customer.subscription.created`, `.updated`, `.deleted` → copier le secret `whsec_…`.
   - *Paramètres → Portail client* : activer l’annulation et le changement de formule.
4. **Powens** (powens.com) : demander un accès commercial, puis renseigner domaine, client ID et secret. Ajouter `https://VOTRE-SITE/api/powens/callback` comme adresse de retour.
5. **Vercel → Settings → Environment Variables** : renseigner toutes les variables de `.env.example`, puis *Redeploy*.

## Avant d’encaisser le premier euro

- Créer une structure juridique (micro-entreprise possible au départ, SASU conseillée ensuite).
- Compléter et faire relire CGU, confidentialité, mentions légales (`app/legal/[slug]/page.js`).
- Contrat commercial avec Powens (agrégation bancaire) et, pour les cours de bourse en direct, un fournisseur sous licence commerciale.
- Ne jamais présenter l’appli comme du conseil en investissement (statut CIF réglementé).

## Développement

```bash
npm install
cp .env.example .env.local   # facultatif : sans ça, mode démo
npm run dev
```
