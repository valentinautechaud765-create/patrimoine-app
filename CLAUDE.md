# Patrimo — contexte du projet

Ce fichier explique le projet à Claude Code. Le propriétaire est Valentin Autechaud : il n'est pas développeur. Parle-lui en français, simplement, et explique en une ou deux phrases ce qui a changé et ce qu'il doit faire de son côté.

## Ce qu'est l'appli

Version **commerciale** (par abonnement) de son appli personnelle « Mon Patrimoine » (dépôt `gestion-valentin-`) : gestion de patrimoine, comptes bancaires synchronisés, investissements, budgets. Objectif : maximiser le chiffre d'affaires avec une offre gratuite + Plus (7,99 €) + Pro (14,99 €).

## Technique

- Next.js 14 (App Router, JavaScript), React 18, déployé sur Vercel.
- `app/page.js` : site commercial. `app/connexion` : connexion. `app/app/page.js` : l'appli. `app/legal/[slug]` : pages légales.
- `lib/config.js` : nom de marque, formules et prix (source unique).
- Supabase (auth + PostgreSQL avec RLS) : schéma dans `supabase/schema.sql`.
- Stripe : `app/api/stripe/*` (checkout, portail, webhook). Powens : `app/api/powens/*`.
- Sans variables d'environnement : mode démo avec montants fictifs signalés à l'écran.

## Règles

1. Aucun secret dans le code ni dans git : tout passe par les variables d'environnement Vercel (`.env.example`).
2. Données financières : la RLS doit toujours empêcher un utilisateur de voir les données d'un autre. La formule (`plan`) n'est modifiable que par le webhook Stripe.
3. Ne jamais afficher de faux montants comme s'ils étaient réels, ni de faux avis clients ou chiffres d'utilisateurs inventés.
4. Avant de pousser, vérifier que `npm run build` passe.
5. Garder le style : sombre, bleu `#3d7cff`, typographie Inter fine, mobile d'abord.
