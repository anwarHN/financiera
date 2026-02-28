-- Backfill system concept used for "Compras de mercadería" in existing accounts.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'concepts'
      and column_name = 'isAccountPayableConcept'
  ) then
    insert into public.concepts (
      "accountId",
      name,
      "parentConceptId",
      "isGroup",
      "isIncome",
      "isExpense",
      "isProduct",
      "isPaymentForm",
      "isAccountPayableConcept",
      "isIncomingPaymentConcept",
      "isOutgoingPaymentConcept",
      "isSystem",
      "taxPercentage",
      price,
      "additionalCharges",
      "createdById"
    )
    select
      a.id,
      'Compras de mercadería',
      null,
      false,
      false,
      true,
      false,
      false,
      true,
      false,
      false,
      true,
      0,
      0,
      0,
      a."createdById"
    from public.accounts a
    where not exists (
      select 1
      from public.concepts c
      where c."accountId" = a.id
        and c."isAccountPayableConcept" = true
    );
  end if;
end;
$$;

