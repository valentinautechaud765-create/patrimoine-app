-- Devise réellement utilisée pour régler un achat/une vente/un dividende.
-- amount reste normalisé en EUR pour les calculs du patrimoine.
alter table public.trades
  add column if not exists settlement_currency text not null default 'EUR'
    check (settlement_currency in ('EUR','USD'));

alter table public.trades
  add column if not exists settlement_amount numeric(14,2);

-- Les anciennes transactions restent en EUR par défaut : aucune conversion rétroactive supposée.
