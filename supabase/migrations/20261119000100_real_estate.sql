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
