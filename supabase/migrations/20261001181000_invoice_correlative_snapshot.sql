begin;
alter table public.transactions add column "correlativeId" bigint references public.correlatives_control(id) on delete restrict;
alter table public.transactions add column "correlativeSnapshot" jsonb;
create unique index transactions_correlative_number_unique on public.transactions ("correlativeId", "number")
  where "correlativeId" is not null;

create function public.format_invoice_number(p_pattern text, p_number bigint) returns text
language plpgsql immutable set search_path = '' as $$
declare result text := p_pattern; token text[];
begin
  result := replace(replace(result, '{0}', p_number::text), '{number}', p_number::text);
  for token in select regexp_matches(result, '(\{(?:0|number):(0{1,18})\})', 'g') loop
    result := replace(result, token[1], lpad(p_number::text, greatest(length(p_number::text), length(token[2])), '0'));
  end loop;
  return result;
end;
$$;

-- Numbering belongs to insertion, never printing or an editable form.
create function public.assign_invoice_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare control public.correlatives_control; v_number bigint;
begin
  if tg_op = 'UPDATE' then
    if new."correlativeId" is distinct from old."correlativeId" or new."correlativeSnapshot" is distinct from old."correlativeSnapshot" then
      raise exception 'No se puede modificar la asignacion del correlativo.';
    end if;
    if old."correlativeId" is not null and
      (new."number" is distinct from old."number" or new."printNumber" is distinct from old."printNumber"
       or new."accountId" is distinct from old."accountId" or new.type is distinct from old.type
       or new."correlativeId" is distinct from old."correlativeId"
       or new."correlativeSnapshot" is distinct from old."correlativeSnapshot") then
      raise exception 'La numeracion de una factura emitida no puede modificarse.';
    end if;
    return new;
  end if;
  new."correlativeId" := null;
  new."correlativeSnapshot" := null;
  if new.type <> 1 or coalesce(new.tags, '{}'::text[]) && array['__prior_balance__','__manual_receivable__'] then return new; end if;
  if auth.uid() is not null and not public.user_belongs_to_account(new."accountId") then
    raise exception 'Sin acceso a esta cuenta.';
  end if;
  -- Account lock also serializes competing controls and avoids SKIP LOCKED
  -- accidentally choosing an unlimited fallback while a fiscal range is busy.
  perform 1 from public.accounts where id = new."accountId" for update;
  select * into control from public.correlatives_control c
    where c."accountId" = new."accountId" and c."transactionType" = 1 and c."isActive"
      and (c."numberTo" is null or c."lastNumber" + 1 <= c."numberTo")
      and (c."limitDate" is null or c."limitDate" >= coalesce(new.date::date, current_date))
    order by c."limitDate" nulls last, c.id for update limit 1;
  if not found then raise exception 'No hay correlativo activo disponible para esta factura.'; end if;
  if control."lastNumber" < control."numberFrom" - 1
    or control."printPattern" !~ '\{(0|number)(:0{1,18})?\}' then raise exception 'Configuracion de correlativo invalida.'; end if;
  v_number := control."lastNumber" + 1;
  new."number" := v_number;
  new."printNumber" := public.format_invoice_number(control."printPattern", v_number);
  if exists (select 1 from public.transactions t where t."accountId" = new."accountId" and t.type = 1
    and t."printNumber" = new."printNumber"
    and not (coalesce(t.tags, '{}'::text[]) && array['__prior_balance__','__manual_receivable__'])) then
    raise exception 'El numero de impresion ya fue utilizado. Revisa el correlativo.';
  end if;
  new."correlativeId" := control.id;
  new."correlativeSnapshot" := jsonb_build_object('printPattern',control."printPattern",'reference1',control."reference1",
    'reference2',control."reference2",'numberFrom',control."numberFrom",'numberTo',control."numberTo",'limitDate',control."limitDate");
  update public.correlatives_control set "lastNumber" = v_number where id = control.id;
  return new;
end;
$$;
revoke all on function public.assign_invoice_number() from public, anon, authenticated;
create trigger assign_invoice_number before insert or update on public.transactions
  for each row execute function public.assign_invoice_number();

-- The old public reservation endpoint must no longer consume numbers separately.
revoke all on function public.reserve_transaction_correlative(bigint, smallint, date) from authenticated, anon, public;

-- Preserve table defaults by inserting only submitted columns. Column names come
-- from pg_attribute and are identifier-quoted; values are always bound JSON.
create function public.create_numbered_invoice(p_transaction jsonb, p_details jsonb) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare tx jsonb; detail jsonb; cols text; v_id bigint; v_account bigint;
begin
  v_account := (p_transaction->>'accountId')::bigint;
  if not public.user_belongs_to_account(v_account) then raise exception 'Sin acceso a esta cuenta.'; end if;
  if not exists (select 1 from public.users_to_profiles u join public.account_profiles p
    on p.id = u."profileId" and p."accountId" = u."accountId"
    where u."accountId" = v_account and u."userId" = auth.uid()
      and (p."isSystemAdmin" or coalesce((p.permissions->'sales'->>'create')::boolean,false))) then
    raise exception 'Sin permiso para crear facturas.';
  end if;
  if (p_transaction->>'type')::int is distinct from 1 then raise exception 'Solo se permiten facturas.'; end if;
  if jsonb_typeof(p_details) is distinct from 'array' or jsonb_array_length(p_details) = 0 then raise exception 'La factura requiere detalle.'; end if;
  tx := (p_transaction - array['id','created_at','number','printNumber','correlativeId','correlativeSnapshot'])
    || jsonb_build_object('createdById', auth.uid());
  select string_agg(format('%I', a.attname), ',') into cols from pg_catalog.pg_attribute a
    where a.attrelid = 'public.transactions'::regclass and a.attnum > 0 and not a.attisdropped
      and tx ? a.attname;
  execute format('insert into public.transactions (%s) select %s from jsonb_populate_record(null::public.transactions,$1) returning id',cols,cols)
    using tx into v_id;
  for detail in select value from jsonb_array_elements(p_details) loop
    detail := (detail - array['id','created_at','transactionId']) || jsonb_build_object('transactionId',v_id,'createdById',auth.uid());
    select string_agg(format('%I', a.attname), ',') into cols from pg_catalog.pg_attribute a
      where a.attrelid = 'public."transactionDetails"'::regclass and a.attnum > 0 and not a.attisdropped and detail ? a.attname;
    execute format('insert into public."transactionDetails" (%s) select %s from jsonb_populate_record(null::public."transactionDetails",$1)',cols,cols) using detail;
  end loop;
  return v_id;
end;
$$;
revoke all on function public.create_numbered_invoice(jsonb,jsonb) from public, anon;
grant execute on function public.create_numbered_invoice(jsonb,jsonb) to authenticated;

create function public.invoice_numbering_permission(p_account bigint, p_action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users_to_profiles u
    join public.account_profiles p on p.id = u."profileId" and p."accountId" = u."accountId"
    join public."usersToAccounts" m on m."accountId" = u."accountId" and m."userId" = u."userId"
    where u."accountId" = p_account and u."userId" = auth.uid()
      and (p."isSystemAdmin" or coalesce((p.permissions->'catalogs'->>p_action)::boolean,false)));
$$;
revoke all on function public.invoice_numbering_permission(bigint,text) from public, anon;
grant execute on function public.invoice_numbering_permission(bigint,text) to authenticated;
drop policy if exists correlatives_control_tenant_access on public.correlatives_control;
create policy correlatives_read on public.correlatives_control for select to authenticated
  using (public.user_belongs_to_account("accountId"));
create policy correlatives_create on public.correlatives_control for insert to authenticated
  with check (public.invoice_numbering_permission("accountId", 'create'));
create policy correlatives_update on public.correlatives_control for update to authenticated
  using (public.invoice_numbering_permission("accountId", 'update'))
  with check (public.invoice_numbering_permission("accountId", 'update'));

create function public.protect_used_invoice_correlative() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new."lastNumber" < old."lastNumber" then raise exception 'No se puede retroceder el correlativo.'; end if;
    if exists (select 1 from public.transactions where "correlativeId" = old.id) and
      (new."accountId",new."transactionType",new."numberFrom",new."numberTo",new."limitDate",new."printPattern",new."reference1",new."reference2")
      is distinct from
      (old."accountId",old."transactionType",old."numberFrom",old."numberTo",old."limitDate",old."printPattern",old."reference1",old."reference2") then
      raise exception 'El correlativo ya emitio facturas. Desactivalo y crea uno nuevo.';
    end if;
  end if;
  if new."numberFrom" < 1 or new."lastNumber" < new."numberFrom" - 1
    or (new."numberTo" is not null and (new."numberTo" < new."numberFrom" or new."lastNumber" > new."numberTo"))
    or new."printPattern" !~ '\{(0|number)(:0{1,18})?\}' then
    raise exception 'Configuracion de correlativo invalida.';
  end if;
  return new;
end;
$$;
create trigger protect_used_invoice_correlative before insert or update on public.correlatives_control
  for each row execute function public.protect_used_invoice_correlative();
commit;
