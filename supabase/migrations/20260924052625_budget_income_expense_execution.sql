begin;

alter table public.concepts add column "incomeConceptId" bigint references public.concepts(id);
alter table public.budget_lines add column "lineType" text;
update public.budget_lines l set "lineType" = case when c."isExpense" then 'expense' else 'income' end
from public.concepts c where c.id = l."conceptId";
alter table public.budget_lines alter column "lineType" set not null;
alter table public.budget_lines add constraint budget_line_type_check check ("lineType" in ('income', 'expense'));
alter table public.budget_lines drop constraint budget_lines_budget_concept_unique;
alter table public.budget_lines add constraint budget_lines_budget_type_concept_unique unique ("budgetId", "lineType", "conceptId");

-- A snapshot, not a second concepts FK: historical names survive catalog changes,
-- and existing PostgREST concepts joins remain unambiguous. NULL means historical.
alter table public."transactionDetails" add column "incomeAllocation" jsonb;
alter table public."transactionDetails" add column "budgetIncomeReversal" numeric;

create function public.validate_budget_concept_configuration() returns trigger
language plpgsql set search_path = '' as $$
declare target public.concepts; account_id bigint;
begin
  if tg_table_name = 'concepts' then
    if new."incomeConceptId" is null then return new; end if;
    select * into target from public.concepts where id = new."incomeConceptId";
    if not found or target."accountId" <> new."accountId" or not coalesce(target."isIncome",false)
      or coalesce(target."isGroup",false) or coalesce(target."isProduct",false) or coalesce(target."isSystem",false)
      or not coalesce(new."isProduct",false) then
      raise exception 'Invalid income concept for product account';
    end if;
  else
    select "accountId" into account_id from public.budgets where id = new."budgetId";
    select * into target from public.concepts where id = new."conceptId";
    if not found or account_id is null or target."accountId" <> account_id or coalesce(target."isGroup",false)
      or coalesce(target."isSystem",false)
      or (new."lineType" = 'income' and not coalesce(target."isIncome",false))
      or (new."lineType" = 'expense' and not coalesce(target."isExpense",false))
      or new.amount < 0 then
      raise exception 'Invalid budget concept, type or amount';
    end if;
  end if;
  return new;
end;
$$;
create trigger validate_product_income_concept before insert or update on public.concepts
for each row execute function public.validate_budget_concept_configuration();
create trigger validate_budget_line_concept before insert or update on public.budget_lines
for each row execute function public.validate_budget_concept_configuration();

create function public.capture_invoice_income_allocation() returns trigger
language plpgsql set search_path = '' as $$
declare tx public.transactions; product public.concepts; target public.concepts;
  source public."transactionDetails"; source_tx public.transactions;
begin
  select * into tx from public.transactions where id = new."transactionId";
  select * into product from public.concepts where id = new."conceptId";
  if tx."accountId" is null or product."accountId" is distinct from tx."accountId" then
    raise exception 'Invalid transaction concept account';
  end if;
  if tg_op = 'UPDATE' and new."conceptId" = old."conceptId" then
    new."incomeAllocation" := old."incomeAllocation";
    new."budgetIncomeReversal" := old."budgetIncomeReversal";
    return new;
  end if;
  if tg_op = 'UPDATE' then new."incomeAllocation" := null; end if;
  if coalesce(tx.tags, array[]::text[]) @> array['__sale_return__'] then
    select * into source from public."transactionDetails" where id = new."transactionPaidId";
    select * into source_tx from public.transactions where id = source."transactionId";
    if source_tx."accountId" is distinct from tx."accountId" or source_tx.id is distinct from tx."sourceTransactionId"
      or source."conceptId" is distinct from new."conceptId" or source.quantity <= 0 then
      raise exception 'Invalid return source';
    end if;
    new."incomeAllocation" := coalesce(source."incomeAllocation", '{}'::jsonb);
    new."budgetIncomeReversal" := round((coalesce(source.net,0)::numeric - coalesce(source.discount,0)::numeric
      + coalesce(source."additionalCharges",0)::numeric) * new.quantity::numeric / source.quantity::numeric, 2);
  elsif tx.type = 1 and not (coalesce(tx.tags, array[]::text[]) @> array['__prior_balance__']) then
    if new."incomeAllocation" is null then
      select * into target from public.concepts where id = product."incomeConceptId" and "accountId" = tx."accountId"
        and "isIncome" and not coalesce("isGroup",false) and not coalesce("isProduct",false) and not coalesce("isSystem",false);
      new."incomeAllocation" := case when found then jsonb_build_object('conceptId',target.id,'name',target.name) else '{}'::jsonb end;
    elsif new."incomeAllocation" ? 'conceptId' then
      perform 1 from public.concepts where id = (new."incomeAllocation"->>'conceptId')::bigint and "accountId" = tx."accountId";
      if not found then raise exception 'Invalid historical income concept account'; end if;
    end if;
    new."budgetIncomeReversal" := null;
  else
    new."incomeAllocation" := null;
    new."budgetIncomeReversal" := null;
  end if;
  return new;
end;
$$;
create trigger capture_invoice_income_allocation before insert or update on public."transactionDetails"
for each row execute function public.capture_invoice_income_allocation();

-- Replacing lines is atomic: a validation error must not erase the old budget.
create function public.replace_budget_lines(p_budget_id bigint, p_account_id bigint, p_lines jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.budgets where id = p_budget_id and "accountId" = p_account_id for update;
  if not found then raise exception 'Budget not found for account'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Budget lines required';
  end if;
  delete from public.budget_lines where "budgetId" = p_budget_id;
  insert into public.budget_lines("budgetId", "conceptId", "lineType", amount, "createdById")
  select p_budget_id, x."conceptId", x."lineType", x.amount, x."createdById"
  from jsonb_to_recordset(p_lines) as x("conceptId" bigint, "lineType" text, amount double precision, "createdById" uuid);
end;
$$;
revoke all on function public.replace_budget_lines(bigint,bigint,jsonb) from public;
grant execute on function public.replace_budget_lines(bigint,bigint,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
