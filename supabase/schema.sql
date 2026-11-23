-- =====================================================================
-- Patrimo — schéma de base de données (Supabase / PostgreSQL)
-- À coller dans Supabase → SQL Editor → Run (peut être relancé sans risque).
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
  acquisition_date date,
  currency text not null default 'EUR',
  updated_at timestamptz not null default now()
);
-- Écarts de rapprochement courtier : séparés des transactions historiques, sans inventer d'achat/vente.
alter table public.holdings add column if not exists quantity_adjustment numeric(20,8) not null default 0;
alter table public.holdings add column if not exists cost_basis_adjustment numeric(14,2) not null default 0;
alter table public.holdings add column if not exists realized_adjustment numeric(14,2) not null default 0;

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

-- Taux annuel d'un livret ou d'un compte de placement (pour le rendement automatique des projections)
alter table public.accounts add column if not exists rate numeric(5,2);

-- Achats, ventes et dividendes d'une position (amount = montant en euros, frais compris)
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  holding_id uuid not null references public.holdings on delete cascade,
  type text not null check (type in ('Achat','Vente','Dividende')),
  quantity numeric(20,8) not null default 0,
  price numeric(16,6) not null default 0,
  fees numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  currency text not null default 'EUR',
  settlement_currency text not null default 'EUR' check (settlement_currency in ('EUR','USD')),
  settlement_amount numeric(14,2),
  date date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists trades_holding_date on public.trades (holding_id, date);\n\n-- Lie chaque achat / vente / dividende à son mouvement de trésorerie pour le retrouver dans Opérations.\nalter table public.transactions add column if not exists trade_id uuid unique references public.trades(id) on delete cascade;\ncreate index if not exists transactions_trade_id on public.transactions (trade_id);

-- Opérations automatiques (salaire, loyer, abonnements, virements…).
-- next_date = prochaine échéance à créer ; l'appli crée les opérations dues à chaque ouverture.
create table if not exists public.recurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  label text not null,
  amount numeric(14,2) not null,
  category text not null default 'Autre',
  account_id uuid references public.accounts on delete set null,
  frequency text not null default 'mensuelle' check (frequency in ('hebdomadaire','mensuelle','trimestrielle','annuelle')),
  day int not null default 1 check (day between 1 and 31),
  next_date date not null,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Chaque opération créée automatiquement est reliée à sa règle : jamais deux fois la même échéance.
alter table public.transactions add column if not exists recurrence_id uuid references public.recurrences on delete set null;
create unique index if not exists transactions_recurrence_date on public.transactions (recurrence_id, date);

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

-- Synchronisation bancaire : identifiant Powens de chaque opération (aucun doublon) et date de dernière synchro
alter table public.transactions add column if not exists external_id text;
create unique index if not exists transactions_user_external on public.transactions (user_id, external_id);
alter table public.powens_links add column if not exists last_sync timestamptz;

-- Compte masqué : exclu du patrimoine et des analyses (ex. compte en double, compte d'un proche)
alter table public.accounts add column if not exists hidden boolean not null default false;

-- Dettes : ce que je dois, ce qu'on me doit, crédits (dont ceux importés de la banque)
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null default 'je_dois' check (kind in ('je_dois','on_me_doit','credit')),
  person text,
  label text not null,
  initial_amount numeric(14,2) not null check (initial_amount >= 0),
  remaining numeric(14,2) not null check (remaining >= 0),
  monthly_payment numeric(14,2),
  rate numeric(5,2),
  start_date date not null default current_date,
  end_date date,
  powens_account_id text,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, powens_account_id)
);
create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  debt_id uuid not null references public.debts on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  date date not null default current_date,
  transaction_id uuid references public.transactions on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists debt_payments_debt on public.debt_payments (debt_id, date);

-- ---------- Sécurité (RLS) ----------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.holdings enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.net_worth_snapshots enable row level security;
alter table public.powens_links enable row level security;
alter table public.trades enable row level security;
alter table public.recurrences enable row level security;
alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;

-- Le profil se lit mais ne se modifie pas depuis le navigateur (la formule est gérée par Stripe).
drop policy if exists "profil: lecture" on public.profiles;
drop policy if exists "profil: nom" on public.profiles;
create policy "profil: lecture" on public.profiles for select using (auth.uid() = id);
create policy "profil: nom" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

do $$ declare t text; begin
  foreach t in array array['accounts','holdings','transactions','budgets','net_worth_snapshots','trades','recurrences','debts','debt_payments'] loop
    execute format('drop policy if exists "%1$s: propriétaire" on public.%1$s', t);
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
    coalesce((select sum(balance) from public.accounts a where a.user_id = u.id and a.kind <> 'investissement' and not a.hidden), 0)
    + coalesce((select sum(value) from public.holdings h where h.user_id = u.id), 0)
    -- comptes-titres synchronisés sans positions détaillées (même calcul que l'appli)
    + coalesce((select sum(balance) from public.accounts a where a.user_id = u.id and a.kind = 'investissement' and not a.hidden
        and not exists (select 1 from public.holdings h where h.account_id = a.id)), 0)
    -- dettes : ce que je dois (et crédits) est retiré, ce qu'on me doit est ajouté
    - coalesce((select sum(remaining) from public.debts d where d.user_id = u.id and d.kind in ('je_dois','credit')), 0)
    + coalesce((select sum(remaining) from public.debts d where d.user_id = u.id and d.kind = 'on_me_doit'), 0)
  from auth.users u
  on conflict (user_id, date) do update set total = excluded.total;
$$;
-- Fonction réservée au serveur : personne ne peut l'appeler depuis le navigateur.
revoke execute on function public.take_net_worth_snapshots() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Photo automatique chaque soir à 23 h 55 (heure UTC)
create extension if not exists pg_cron;
select cron.schedule('patrimoine-quotidien', '55 23 * * *', 'select public.take_net_worth_snapshots()');


-- ---------- Virements internes entre comptes ----------
-- Deux écritures liées (débit/crédit), jamais une dépense ni un revenu.
alter table public.transactions
  add column if not exists transfer_id uuid,
  add column if not exists transfer_side text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_transfer_side_check') then
    alter table public.transactions add constraint transactions_transfer_side_check
      check (transfer_side is null or transfer_side in ('out','in'));
  end if;
end $$;
create unique index if not exists transactions_transfer_leg_unique
  on public.transactions (transfer_id, transfer_side)
  where transfer_id is not null;

create or replace function public.create_internal_transfer(
  p_from_account uuid, p_to_account uuid, p_amount numeric,
  p_date date default current_date, p_note text default null
) returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_from public.accounts%rowtype;
  v_to public.accounts%rowtype;
  v_transfer uuid := gen_random_uuid();
  v_amount numeric(14,2);
  v_date date := coalesce(p_date, current_date);
  v_note text := left(trim(coalesce(p_note, '')), 80);
  v_existing uuid;
  v_from_new boolean := false;
  v_to_new boolean := false;
begin
  if v_user is null then raise exception 'Session expirée. Reconnectez-vous.'; end if;
  if p_from_account is null or p_to_account is null or p_from_account = p_to_account then
    raise exception 'Choisissez deux comptes différents.';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;
  v_amount := round(p_amount, 2);
  if v_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;
  if v_amount > 999999999999.99 then raise exception 'Montant trop élevé.'; end if;

  perform 1 from public.accounts
    where user_id = v_user and id in (p_from_account, p_to_account)
    order by id for update;
  select * into v_from from public.accounts where id = p_from_account and user_id = v_user;
  if not found then raise exception 'Compte de départ introuvable.'; end if;
  select * into v_to from public.accounts where id = p_to_account and user_id = v_user;
  if not found then raise exception 'Compte destinataire introuvable.'; end if;
  if v_from.currency <> v_to.currency then raise exception 'Les deux comptes doivent avoir la même devise.'; end if;

  -- Réutiliser une opération déjà importée par Powens plutôt que créer un doublon.
  select t.id into v_existing from public.transactions t
  where t.user_id = v_user and t.account_id = v_from.id
    and t.transfer_id is null and t.amount = -v_amount
    and t.date between v_date - 3 and v_date + 3
    and (t.category = 'Virement interne' or t.label ~* '(vir|virement|transfert|transfer)')
  order by (t.external_id is not null) desc, abs(t.date - v_date), t.created_at
  limit 1 for update;
  if v_existing is not null then
    update public.transactions set transfer_id = v_transfer, transfer_side = 'out', category = 'Virement interne'
      where id = v_existing and user_id = v_user;
  else
    insert into public.transactions (user_id, account_id, date, label, amount, category, transfer_id, transfer_side)
    values (v_user, v_from.id, v_date, left('Virement vers ' || v_to.name || case when v_note <> '' then ' · ' || v_note else '' end, 120), -v_amount, 'Virement interne', v_transfer, 'out');
    v_from_new := true;
  end if;

  v_existing := null;
  select t.id into v_existing from public.transactions t
  where t.user_id = v_user and t.account_id = v_to.id
    and t.transfer_id is null and t.amount = v_amount
    and t.date between v_date - 3 and v_date + 3
    and (t.category = 'Virement interne' or t.label ~* '(vir|virement|transfert|transfer)')
  order by (t.external_id is not null) desc, abs(t.date - v_date), t.created_at
  limit 1 for update;
  if v_existing is not null then
    update public.transactions set transfer_id = v_transfer, transfer_side = 'in', category = 'Virement interne'
      where id = v_existing and user_id = v_user;
  else
    insert into public.transactions (user_id, account_id, date, label, amount, category, transfer_id, transfer_side)
    values (v_user, v_to.id, v_date, left('Virement depuis ' || v_from.name || case when v_note <> '' then ' · ' || v_note else '' end, 120), v_amount, 'Virement interne', v_transfer, 'in');
    v_to_new := true;
  end if;

  if v_from.powens_account_id is null and v_from_new then
    update public.accounts set balance = balance - v_amount, updated_at = now() where id = v_from.id and user_id = v_user;
  end if;
  if v_to.powens_account_id is null and v_to_new then
    update public.accounts set balance = balance + v_amount, updated_at = now() where id = v_to.id and user_id = v_user;
  end if;
  return jsonb_build_object('transfer_id', v_transfer, 'from_account_id', v_from.id, 'to_account_id', v_to.id, 'amount', v_amount, 'date', v_date, 'matched_existing', not (v_from_new and v_to_new));
end;
$$;

create or replace function public.delete_internal_transfer(p_transfer_id uuid)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.transactions%rowtype;
  v_count integer := 0;
begin
  if v_user is null then raise exception 'Session expirée. Reconnectez-vous.'; end if;
  if p_transfer_id is null then raise exception 'Virement introuvable.'; end if;
  perform 1 from public.accounts a
  where a.user_id = v_user and a.id in (
    select t.account_id from public.transactions t where t.user_id = v_user and t.transfer_id = p_transfer_id
  ) order by a.id for update;
  for v_row in
    select * from public.transactions where user_id = v_user and transfer_id = p_transfer_id
    order by transfer_side for update
  loop
    v_count := v_count + 1;
    if v_row.external_id is null then
      if v_row.account_id is not null then
        update public.accounts a set balance = a.balance - v_row.amount, updated_at = now()
        where a.id = v_row.account_id and a.user_id = v_user and a.powens_account_id is null;
      end if;
    else
      update public.transactions set transfer_id = null, transfer_side = null, category = 'Virement interne'
      where id = v_row.id and user_id = v_user;
    end if;
  end loop;
  if v_count <> 2 then raise exception 'Ce virement est incomplet ou introuvable.'; end if;
  delete from public.transactions where user_id = v_user and transfer_id = p_transfer_id and external_id is null;
  return jsonb_build_object('transfer_id', p_transfer_id, 'deleted', true);
end;
$$;

revoke all on function public.create_internal_transfer(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.create_internal_transfer(uuid, uuid, numeric, date, text) to authenticated;
revoke all on function public.delete_internal_transfer(uuid) from public, anon;
grant execute on function public.delete_internal_transfer(uuid) to authenticated;
