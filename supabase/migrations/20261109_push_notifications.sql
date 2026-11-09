-- Patrimo : abonnements Web Push par utilisateur et par appareil.
-- Exécuter une seule fois dans Supabase > SQL Editor.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  preferences jsonb not null default '{"budget":true,"bills":true,"bank":true,"investments":true,"weekly":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
-- Aucune policy client : seuls les endpoints serveur avec la clé service-role accèdent à ces données.
