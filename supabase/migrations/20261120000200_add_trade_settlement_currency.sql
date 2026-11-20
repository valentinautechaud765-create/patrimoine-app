alter table public.trades
  add column if not exists settlement_currency text not null default 'EUR';

alter table public.trades
  drop constraint if exists trades_settlement_currency_check;

alter table public.trades
  add constraint trades_settlement_currency_check
  check (settlement_currency in ('EUR', 'USD'));
