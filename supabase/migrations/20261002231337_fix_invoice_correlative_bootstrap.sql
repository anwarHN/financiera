begin;

-- Legacy clients still call this RPC before inserting the invoice. Keep it as
-- a non-consuming preview; the insert trigger remains the only number writer.
create or replace function public.reserve_transaction_correlative(
  target_account_id bigint,
  target_transaction_type smallint,
  target_date date default current_date
)
returns table(control_id bigint, next_number bigint, print_number varchar)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_control public.correlatives_control%rowtype;
begin
  if auth.uid() is null or not public.user_belongs_to_account(target_account_id) then
    raise exception 'Sin acceso a esta cuenta.';
  end if;
  if target_transaction_type <> 1 then
    raise exception 'Solo se permiten correlativos de factura.';
  end if;
  if not exists (
    select 1
    from public.users_to_profiles u
    join public.account_profiles p
      on p.id = u."profileId" and p."accountId" = u."accountId"
    where u."accountId" = target_account_id
      and u."userId" = auth.uid()
      and (p."isSystemAdmin" or coalesce((p.permissions->'sales'->>'create')::boolean, false))
  ) then
    raise exception 'Sin permiso para crear facturas.';
  end if;

  perform 1 from public.accounts where id = target_account_id for update;
  select * into selected_control
  from public.correlatives_control c
  where c."accountId" = target_account_id
    and c."transactionType" = 1
    and c."isActive"
    and (c."numberTo" is null or c."lastNumber" + 1 <= c."numberTo")
    and (c."limitDate" is null or c."limitDate" >= coalesce(target_date, current_date))
  order by c."limitDate" nulls last, c.id
  for update
  limit 1;

  if not found then
    if exists (
      select 1 from public.correlatives_control c
      where c."accountId" = target_account_id and c."transactionType" = 1
    ) then
      raise exception 'No hay correlativo activo disponible para esta factura.';
    end if;
    insert into public.correlatives_control (
      "accountId", "transactionType", "lastNumber", "numberFrom", "numberTo",
      "limitDate", "isActive", "printPattern", "reference1", "reference2", "createdById"
    ) values (
      target_account_id, 1, 0, 1, null, null, true, 'FAC-{0}', 'Inicial', null, auth.uid()
    ) returning * into selected_control;
  end if;

  control_id := selected_control.id;
  next_number := selected_control."lastNumber" + 1;
  print_number := public.format_invoice_number(selected_control."printPattern", next_number)::varchar;
  return next;
end;
$$;

revoke all on function public.reserve_transaction_correlative(bigint, smallint, date) from public, anon;
grant execute on function public.reserve_transaction_correlative(bigint, smallint, date) to authenticated;

create or replace function public.assign_invoice_number() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  control public.correlatives_control;
  v_number bigint;
begin
  if tg_op = 'UPDATE' then
    if new."correlativeId" is distinct from old."correlativeId"
      or new."correlativeSnapshot" is distinct from old."correlativeSnapshot" then
      raise exception 'No se puede modificar la asignacion del correlativo.';
    end if;
    if old."correlativeId" is not null and (
      new."number" is distinct from old."number"
      or new."printNumber" is distinct from old."printNumber"
      or new."accountId" is distinct from old."accountId"
      or new.type is distinct from old.type
      or new."correlativeId" is distinct from old."correlativeId"
      or new."correlativeSnapshot" is distinct from old."correlativeSnapshot"
    ) then
      raise exception 'La numeracion de una factura emitida no puede modificarse.';
    end if;
    return new;
  end if;

  new."correlativeId" := null;
  new."correlativeSnapshot" := null;
  if new.type <> 1
    or coalesce(new.tags, '{}'::text[]) && array['__prior_balance__', '__manual_receivable__'] then
    return new;
  end if;
  if auth.uid() is not null and not public.user_belongs_to_account(new."accountId") then
    raise exception 'Sin acceso a esta cuenta.';
  end if;

  -- The account lock serializes both first-use creation and number assignment.
  perform 1 from public.accounts where id = new."accountId" for update;
  select * into control
  from public.correlatives_control c
  where c."accountId" = new."accountId"
    and c."transactionType" = 1
    and c."isActive"
    and (c."numberTo" is null or c."lastNumber" + 1 <= c."numberTo")
    and (c."limitDate" is null or c."limitDate" >= coalesce(new.date::date, current_date))
  order by c."limitDate" nulls last, c.id
  for update
  limit 1;

  if not found then
    -- Do not bypass an exhausted, expired, or deliberately inactive setup.
    if exists (
      select 1 from public.correlatives_control c
      where c."accountId" = new."accountId" and c."transactionType" = 1
    ) then
      raise exception 'No hay correlativo activo disponible para esta factura.';
    end if;
    insert into public.correlatives_control (
      "accountId", "transactionType", "lastNumber", "numberFrom", "numberTo",
      "limitDate", "isActive", "printPattern", "reference1", "reference2", "createdById"
    ) values (
      new."accountId", 1, 0, 1, null, null, true, 'FAC-{0}', 'Inicial', null, auth.uid()
    ) returning * into control;
  end if;

  if control."lastNumber" < control."numberFrom" - 1
    or control."printPattern" !~ '\{(0|number)(:0{1,18})?\}' then
    raise exception 'Configuracion de correlativo invalida.';
  end if;
  v_number := control."lastNumber" + 1;
  new."number" := v_number;
  new."printNumber" := public.format_invoice_number(control."printPattern", v_number);
  if exists (
    select 1 from public.transactions t
    where t."accountId" = new."accountId"
      and t.type = 1
      and t."printNumber" = new."printNumber"
      and not (coalesce(t.tags, '{}'::text[]) && array['__prior_balance__', '__manual_receivable__'])
  ) then
    raise exception 'El numero de impresion ya fue utilizado. Revisa el correlativo.';
  end if;
  new."correlativeId" := control.id;
  new."correlativeSnapshot" := jsonb_build_object(
    'printPattern', control."printPattern",
    'reference1', control."reference1",
    'reference2', control."reference2",
    'numberFrom', control."numberFrom",
    'numberTo', control."numberTo",
    'limitDate', control."limitDate"
  );
  update public.correlatives_control set "lastNumber" = v_number where id = control.id;
  return new;
end;
$$;

revoke all on function public.assign_invoice_number() from public, anon, authenticated;

commit;
