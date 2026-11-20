-- Patrimo — compatibilité de l'historique des achats/ventes
-- Migration additive et relançable : aucune transaction existante n'est supprimée.

alter table public.holdings
  add column if not exists acquisition_date date;

alter table public.trades
  add column if not exists account_id uuid references public.accounts(id) on delete set null,
  add column if not exists settlement_currency text not null default 'EUR',
  add column if not exists settlement_amount numeric(14,2);

-- Le montant et la devise de règlement restent distincts de la devise de cotation du titre.
alter table public.trades
  alter column settlement_currency set default 'EUR';

-- Lie les mouvements de trésorerie aux transactions boursières sans doublon.
alter table public.transactions
  add column if not exists trade_id uuid references public.trades(id) on delete cascade;

create unique index if not exists transactions_trade_id_unique
  on public.transactions(trade_id)
  where trade_id is not null;

create index if not exists trades_holding_date
  on public.trades(holding_id, date);

create index if not exists trades_user_date
  on public.trades(user_id, date desc);

-- Demande à PostgREST de recharger immédiatement son cache de schéma.
notify pgrst, 'reload schema';
