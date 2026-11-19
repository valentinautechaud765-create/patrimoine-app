-- Estimations immobilières : champs séparés et provenance obligatoire pour leur prise en compte.
alter table public.properties add column if not exists market_value numeric(14,2);
alter table public.properties add column if not exists market_estimate_date date;
alter table public.properties add column if not exists market_estimate_source text;

create or replace function public.take_net_worth_snapshots() returns void language sql security definer set search_path = public as $$
  insert into public.net_worth_snapshots (user_id, date, total)
  select u.id, current_date,
    coalesce((select sum(balance) from public.accounts a where a.user_id = u.id and a.kind <> 'investissement' and not a.hidden), 0)
    + coalesce((select sum(value) from public.holdings h where h.user_id = u.id), 0)
    + coalesce((select sum(balance) from public.accounts a where a.user_id = u.id and a.kind = 'investissement' and not a.hidden
        and not exists (select 1 from public.holdings h where h.account_id = a.id)), 0)
    - coalesce((select sum(remaining) from public.debts d where d.user_id = u.id and d.kind in ('je_dois','credit')), 0)
    + coalesce((select sum(remaining) from public.debts d where d.user_id = u.id and d.kind = 'on_me_doit'), 0)
    + coalesce((select sum(((case
        when p.market_value > 0 and p.market_estimate_date is not null and nullif(trim(p.market_estimate_source), '') is not null then p.market_value
        when p.valuation_status = 'Confirmé' then p.value else 0 end) - p.mortgage_remaining) * p.ownership_share / 100)
      from public.properties p where p.user_id = u.id
        and ((p.market_value > 0 and p.market_estimate_date is not null and nullif(trim(p.market_estimate_source), '') is not null) or p.valuation_status = 'Confirmé')), 0)
  from auth.users u
  on conflict (user_id, date) do update set total = excluded.total;
$$;
revoke execute on function public.take_net_worth_snapshots() from public, anon, authenticated;
