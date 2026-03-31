alter table public.transactions
add column if not exists "number" bigint;

alter table public.transactions
add column if not exists "printNumber" varchar;

create table if not exists public.correlatives_control (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  "accountId" bigint not null references public.accounts(id) on delete cascade,
  "transactionType" smallint not null,
  "lastNumber" bigint not null default 0,
  "numberFrom" bigint not null default 1,
  "numberTo" bigint,
  "limitDate" date,
  "isActive" boolean not null default true,
  "printPattern" varchar not null default '{0}',
  "reference1" varchar,
  "reference2" varchar,
  "createdById" uuid references auth.users(id)
);

create index if not exists correlatives_control_account_type_idx
  on public.correlatives_control ("accountId", "transactionType", "isActive");

create or replace function public.reserve_transaction_correlative(
  target_account_id bigint,
  target_transaction_type smallint,
  target_date date default current_date
)
returns table(
  control_id bigint,
  next_number bigint,
  print_number varchar
)
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_control public.correlatives_control%rowtype;
  next_number bigint;
begin
  select *
  into selected_control
  from public.correlatives_control cc
  where cc."accountId" = target_account_id
    and cc."transactionType" = target_transaction_type
    and cc."isActive" = true
    and (cc."numberTo" is null or cc."lastNumber" + 1 <= cc."numberTo")
    and (cc."limitDate" is null or cc."limitDate" >= target_date)
  order by
    case when cc."limitDate" is null then 1 else 0 end,
    cc."limitDate" asc,
    cc.id asc
  for update
  limit 1;

  if selected_control.id is null then
    raise exception 'No hay un correlativo activo disponible para este tipo de transacción.';
  end if;

  if selected_control."lastNumber" < selected_control."numberFrom" - 1 then
    raise exception 'El correlativo % tiene una configuración inválida.', selected_control.id;
  end if;

  next_number := selected_control."lastNumber" + 1;

  update public.correlatives_control
  set "lastNumber" = next_number
  where id = selected_control.id;

  return query
  select
    selected_control.id,
    next_number,
    replace(coalesce(selected_control."printPattern", '{0}'), '{0}', next_number::text)::varchar;
end;
$$;

revoke all on function public.reserve_transaction_correlative(bigint, smallint, date) from public;
grant execute on function public.reserve_transaction_correlative(bigint, smallint, date) to authenticated;
