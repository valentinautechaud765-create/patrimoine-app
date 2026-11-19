-- Détails des cohéritiers et co-indivisaires (facultatifs).
alter table public.properties
  add column if not exists co_owners text;
