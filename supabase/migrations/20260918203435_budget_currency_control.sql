-- Nullable for legacy accounts without a configured local currency.
alter table public.budgets
  add column if not exists "currencyId" bigint references public.currencies(id);

update public.budgets b
set "currencyId" = (
  select c.id from public.currencies c
  where c."isLocal" = true
    and (c."accountId" = b."accountId" or c."accountId" is null)
  order by (c."accountId" = b."accountId") desc nulls last, c.id
  limit 1
)
where b."currencyId" is null;
