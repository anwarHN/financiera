begin;
-- Do not infer tax for historical returns. NULL remains visibly unvalued.
alter table public."transactionDetails" add column "returnTaxReversal" numeric;

create function public.capture_return_tax_reversal() returns trigger
language plpgsql set search_path = '' as $$
declare tx public.transactions; source public."transactionDetails";
begin
  if tg_op = 'UPDATE' and new."transactionId" = old."transactionId"
    and new."transactionPaidId" is not distinct from old."transactionPaidId" then
    new."returnTaxReversal" := old."returnTaxReversal";
    return new;
  end if;
  select * into tx from public.transactions where id = new."transactionId";
  new."returnTaxReversal" := null;
  if coalesce(tx.tags, array[]::text[]) @> array['__sale_return__'] then
    select d.* into source from public."transactionDetails" d
      join public.transactions t on t.id = d."transactionId"
      where d.id = new."transactionPaidId" and t."accountId" = tx."accountId"
        and t.id = tx."sourceTransactionId" and d."conceptId" = new."conceptId";
    if not found or source.quantity <= 0 then raise exception 'Invalid return tax source'; end if;
    new."returnTaxReversal" := round(abs(coalesce(source.tax,0)::numeric) * new.quantity::numeric / source.quantity::numeric, 2);
  end if;
  return new;
end;
$$;
create trigger capture_return_tax_reversal before insert or update on public."transactionDetails"
for each row execute function public.capture_return_tax_reversal();
notify pgrst, 'reload schema';
commit;
