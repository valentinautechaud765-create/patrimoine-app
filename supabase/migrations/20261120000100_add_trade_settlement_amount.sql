alter table public.trades
  add column if not exists settlement_amount numeric(14,2);
