-- Date d'acquisition facultative des positions (NULL = date inconnue/non renseignée).
alter table public.holdings
  add column if not exists acquisition_date date;
