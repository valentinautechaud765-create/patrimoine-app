-- Ne comptabiliser dans le patrimoine global que les évaluations immobilières confirmées.
alter table public.properties
  add column if not exists valuation_status text not null default 'À vérifier'
  check (valuation_status in ('À vérifier','À actualiser','Confirmé'));

create or replace function public.take_net_worth_snapshots() returns void language sql security definer set search_path = public as $$
  insert into public.net_worth_snapshots (user_id, date, total)
  select u.id, current_date,
    coalesce((select sum(balance) from public.accounts a where a.user_id = u.id and a.kind <> 'investissement' and not a.hidden), 0)
    + coalesce((select sum(value) from public.holdings h where h.user_id = u.id), 0)
    + coalesce((select sum(balance) from public.accounts a where a.user_id = u.id and a.kind = 'investissement' and not a.hidden
        and not exists (select 1 from public.holdings h where h.account_id = a.id)), 0)
    - coalesce((select sum(remaining) from public.debts d where d.user_id = u.id and d.kind in ('je_dois','credit')), 0)
    + coalesce((select sum(remaining) from public.debts d where d.user_id = u.id and d.kind = 'on_me_doit'), 0)
    + coalesce((select sum((p.value - p.mortgage_remaining) * p.ownership_share / 100) from public.properties p where p.user_id = u.id and p.valuation_status = 'Confirmé'), 0)
  from auth.users u
  on conflict (user_id, date) do update set total = excluded.total;
$$;
revoke execute on function public.take_net_worth_snapshots() from public, anon, authenticated;
