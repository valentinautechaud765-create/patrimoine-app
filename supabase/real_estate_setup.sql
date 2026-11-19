-- Patrimoine immobilier : biens, indivision, héritage/donation, crédit et revenus locatifs.
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  property_type text not null default 'Appartement' check (property_type in ('Appartement','Maison','Terrain','Immeuble','Parking','Local commercial','Autre')),
  address text,
  acquisition_type text not null default 'Achat' check (acquisition_type in ('Achat','Héritage','Donation','Autre')),
  ownership_type text not null default 'Pleine propriété' check (ownership_type in ('Pleine propriété','Indivision','Usufruit','Nue-propriété')),
  ownership_share numeric(6,3) not null default 100 check (ownership_share > 0 and ownership_share <= 100),
  acquired_at date,
  purchase_price numeric(14,2) not null default 0,
  value numeric(14,2) not null default 0,
  mortgage_remaining numeric(14,2) not null default 0,
  monthly_rent numeric(14,2) not null default 0,
  monthly_charges numeric(14,2) not null default 0,
  property_tax numeric(14,2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists properties_user_created on public.properties(user_id, created_at desc);
alter table public.properties enable row level security;
drop policy if exists "properties: propriétaire" on public.properties;
create policy "properties: propriétaire" on public.properties for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- Inclure la quote-part immobilière dans les photos quotidiennes du patrimoine.
alter table public.properties add column if not exists valuation_status text not null default 'À vérifier' check (valuation_status in ('À vérifier','À actualiser','Confirmé'));


-- Suivi administratif des biens issus d'une succession.
alter table public.properties add column if not exists succession_status text not null default 'Sans objet' check (succession_status in ('Sans objet','En cours','À confirmer chez le notaire','Clôturée'));

create or replace function public.take_net_worth_snapshots() returns void language sql security definer set search_path = public as $$
  insert into public.net_worth_snapshots (user_id, date, total)
  select u.id, current_date,
    coalesce((select sum(balance) from public.accounts a where a.user_id = u.id and a.kind <> 'investissement' and not a.hidden), 0)
    + coalesce((select sum(value) from public.holdings h where h.user_id = u.id), 0)
    + coalesce((select sum(balance) from public.accounts a where a.user_id = u.id and a.kind = 'investissement' and not a.hidden
        and not exists (select 1 from public.holdings h where h.account_id = a.id)), 0)
    - coalesce((select sum(remaining) from public.debts d where d.user_id = u.id and d.kind in ('je_dois','credit')), 0)
    + coalesce((select sum(remaining) from public.debts d where d.user_id = u.id and d.kind = 'on_me_doit'), 0)
    + coalesce((select sum(((case when p.market_value > 0 then p.market_value when p.valuation_status = 'Confirmé' then p.value else 0 end) - p.mortgage_remaining) * p.ownership_share / 100) from public.properties p where p.user_id = u.id and (p.market_value > 0 or p.valuation_status = 'Confirmé')), 0)
  from auth.users u
  on conflict (user_id, date) do update set total = excluded.total;
$$;
revoke execute on function public.take_net_worth_snapshots() from public, anon, authenticated;


-- Détails des cohéritiers et co-indivisaires (facultatifs).
alter table public.properties
  add column if not exists co_owners text;



-- Estimation de marché distincte de la valeur de référence notariale.
alter table public.properties add column if not exists market_value numeric(14,2);
alter table public.properties add column if not exists market_estimate_date date;
alter table public.properties add column if not exists market_estimate_source text;
