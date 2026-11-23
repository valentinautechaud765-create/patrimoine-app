-- Virements internes entre comptes : deux écritures liées, aucun revenu/dépense.
alter table public.transactions
  add column if not exists transfer_id uuid,
  add column if not exists transfer_side text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_transfer_side_check') then
    alter table public.transactions add constraint transactions_transfer_side_check
      check (transfer_side is null or transfer_side in ('out','in'));
  end if;
end $$;

create unique index if not exists transactions_transfer_leg_unique
  on public.transactions (transfer_id, transfer_side)
  where transfer_id is not null;

create or replace function public.create_internal_transfer(
  p_from_account uuid,
  p_to_account uuid,
  p_amount numeric,
  p_date date default current_date,
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_from public.accounts%rowtype;
  v_to public.accounts%rowtype;
  v_transfer uuid := gen_random_uuid();
  v_amount numeric(14,2);
  v_date date := coalesce(p_date, current_date);
  v_note text := left(trim(coalesce(p_note, '')), 80);
begin
  if v_user is null then raise exception 'Session expirée. Reconnectez-vous.'; end if;
  if p_from_account is null or p_to_account is null or p_from_account = p_to_account then
    raise exception 'Choisissez deux comptes différents.';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;
  v_amount := round(p_amount, 2);
  if v_amount <= 0 then raise exception 'Le montant doit être supérieur à zéro.'; end if;
  if v_amount > 999999999999.99 then raise exception 'Montant trop élevé.'; end if;

  perform 1 from public.accounts
    where user_id = v_user and id in (p_from_account, p_to_account)
    order by id for update;

  select * into v_from from public.accounts where id = p_from_account and user_id = v_user;
  if not found then raise exception 'Compte de départ introuvable.'; end if;
  select * into v_to from public.accounts where id = p_to_account and user_id = v_user;
  if not found then raise exception 'Compte destinataire introuvable.'; end if;
  if v_from.currency <> v_to.currency then raise exception 'Les deux comptes doivent avoir la même devise.'; end if;

  insert into public.transactions (user_id, account_id, date, label, amount, category, transfer_id, transfer_side)
  values
    (v_user, v_from.id, v_date, left('Virement vers ' || v_to.name || case when v_note <> '' then ' · ' || v_note else '' end, 120), -v_amount, 'Virement interne', v_transfer, 'out'),
    (v_user, v_to.id, v_date, left('Virement depuis ' || v_from.name || case when v_note <> '' then ' · ' || v_note else '' end, 120), v_amount, 'Virement interne', v_transfer, 'in');

  if v_from.powens_account_id is null then
    update public.accounts set balance = balance - v_amount, updated_at = now() where id = v_from.id and user_id = v_user;
  end if;
  if v_to.powens_account_id is null then
    update public.accounts set balance = balance + v_amount, updated_at = now() where id = v_to.id and user_id = v_user;
  end if;

  return jsonb_build_object('transfer_id', v_transfer, 'from_account_id', v_from.id, 'to_account_id', v_to.id, 'amount', v_amount, 'date', v_date);
end;
$$;

create or replace function public.delete_internal_transfer(p_transfer_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.transactions%rowtype;
  v_count integer := 0;
begin
  if v_user is null then raise exception 'Session expirée. Reconnectez-vous.'; end if;
  if p_transfer_id is null then raise exception 'Virement introuvable.'; end if;

  perform 1 from public.accounts a
    where a.user_id = v_user
      and a.id in (select t.account_id from public.transactions t where t.user_id = v_user and t.transfer_id = p_transfer_id)
    order by a.id for update;

  for v_row in
    select * from public.transactions
    where user_id = v_user and transfer_id = p_transfer_id
    order by transfer_side
    for update
  loop
    v_count := v_count + 1;
    if v_row.account_id is not null then
      update public.accounts a
      set balance = a.balance - v_row.amount, updated_at = now()
      where a.id = v_row.account_id and a.user_id = v_user and a.powens_account_id is null;
    end if;
  end loop;
  if v_count <> 2 then raise exception 'Ce virement est incomplet ou introuvable.'; end if;
  delete from public.transactions where user_id = v_user and transfer_id = p_transfer_id;
  return jsonb_build_object('transfer_id', p_transfer_id, 'deleted', true);
end;
$$;

revoke all on function public.create_internal_transfer(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.create_internal_transfer(uuid, uuid, numeric, date, text) to authenticated;
revoke all on function public.delete_internal_transfer(uuid) from public, anon;
grant execute on function public.delete_internal_transfer(uuid) to authenticated;
