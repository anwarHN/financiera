begin;

alter table public.transactions
  add column "budgetId" bigint references public.budgets(id) on delete restrict;

create index transactions_account_budget_idx
  on public.transactions ("accountId", "budgetId")
  where "budgetId" is not null;

create function public.validate_transaction_budget_assignment() returns trigger
language plpgsql set search_path = '' as $$
declare
  selected_budget public.budgets;
begin
  if new."budgetId" is null then
    return new;
  end if;

  select * into selected_budget
  from public.budgets
  where id = new."budgetId";

  if not found or selected_budget."accountId" is distinct from new."accountId" then
    raise exception 'Budget does not belong to the transaction account';
  end if;
  if selected_budget."projectId" is distinct from new."projectId" then
    raise exception 'Transaction project does not match the selected budget';
  end if;
  if selected_budget."currencyId" is null or selected_budget."currencyId" is distinct from new."currencyId" then
    raise exception 'Transaction currency does not match the selected budget';
  end if;
  if not selected_budget."isActive" then
    if tg_op = 'INSERT' then
      raise exception 'Cannot assign an inactive budget';
    end if;
    if old."budgetId" is distinct from new."budgetId" then
      raise exception 'Cannot assign an inactive budget';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_transaction_budget
before insert or update of "accountId", "budgetId", "projectId", "currencyId"
on public.transactions
for each row execute function public.validate_transaction_budget_assignment();

notify pgrst, 'reload schema';
commit;
