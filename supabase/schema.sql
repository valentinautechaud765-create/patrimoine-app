-- =====================================================================
-- Patrimo — schéma de base de données (Supabase / PostgreSQL)
-- À coller une fois dans Supabase → SQL Editor → Run.
-- Chaque table est protégée par RLS : un utilisateur ne voit que ses données.
-- =====================================================================

-- Profil et abonnement (créé automatiquement à l'inscription)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  plan text not null default 'free' check (plan in ('free','plus','pro')),
  plan_status text,
  trial_used boolean not null default false,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  institution text,
  kind text not null default 'courant' check (kind in ('courant','epargne','investissement')),
  balance numeric(14,2) not null default 0,
  currency text not null default 'EUR',
  powens_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, powens_account_id)
);

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid references public.accounts on delete set null,
  name text not null,
  ticker text,
  asset_class text not null default 'Action',
  quantity numeric(20,8) not null default 0,
  cost_basis numeric(14,2) not null default 0,
  value numeric(14,2) not null default 0,
  currency text not null default 'EUR',
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid references public.accounts on delete set null,
  date date not null default current_date,
  label text not null,
  amount numeric(14,2) not null,
  category text not null default 'Autre',
  created_at timestamptz not null default now()
);
create index if not exists transactions_user_date on public.transactions (user_id, date desc);

create table if not exists public.budgets (
  user_id uuid not null references auth.users on delete cascade,
  category text not null,
  monthly_limit numeric(14,2) not null check (monthly_limit > 0),
  primary key (user_id, category)
);

-- Valeur du patrimoine chaque jour (pour les courbes)
create table if not exists public.net_worth_snapshots (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  total numeric(14,2) not null,
  primary key (user_id, date)
);

-- Lien Powens : jeton chiffré, jamais lisible depuis le navigateur (aucune règle de lecture)
create table if not exists public.powens_links (
  user_id uuid primary key references auth.users on delete cascade,
  powens_user_id text,
  token_cipher text not null,
  pending_state text,
  created_at timestamptz not null default now()
);

-- ---------- Sécurité (RLS) ----------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.holdings enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.net_worth_snapshots enable row level security;
alter table public.powens_links enable row level security;

-- Le profil se lit mais ne se modifie pas depuis le navigateur (la formule est gérée par Stripe).
create policy "profil: lecture" on public.profiles for select using (auth.uid() = id);
create policy "profil: nom" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

do $$ declare t text; begin
  foreach t in array array['accounts','holdings','transactions','budgets','net_worth_snapshots'] loop
    execute format('create policy "%1$s: propriétaire" on public.%1$s for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ---------- Profil créé à l'inscription ----------
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name') on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Photo quotidienne du patrimoine ----------
create or replace function public.take_net_worth_snapshots() returns void language sql security definer set search_path = public as $$
  insert into public.net_worth_snapshots (user_id, date, total)
  select u.id, current_date,
    coalesce((select sum(balance) from public.accounts a where a.user_id = u.id and a.kind <> 'investissement'), 0)
    + coalesce((select sum(value) from public.holdings h where h.user_id = u.id), 0)
    -- comptes-titres synchronisés sans positions détaillées (même calcul que l'appli)
    + coalesce((select sum(balance) from public.accounts a where a.user_id = u.id and a.kind = 'investissement'
        and not exists (select 1 from public.holdings h where h.account_id = a.id)), 0)
  from auth.users u
  on conflict (user_id, date) do update set total = excluded.total;
$$;
-- Activer l'extension pg_cron (Database → Extensions), puis :
-- select cron.schedule('patrimoine-quotidien', '55 23 * * *', 'select public.take_net_worth_snapshots()');
