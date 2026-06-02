with filtered as (
  select
    t.id,
    t.date,
    t.type,
    t.name,
    t.total,
    t."accountPaymentFormId",
    pm.code as payment_method_code,
    case
      when t."isAccountPayable" is true
        and coalesce(t.tags, '{}'::text[]) @> array['__payable_cash_in__']
        then abs(coalesce(t.total, 0))
      when t."isIncomingPayment" is true then abs(coalesce(t.total, 0))
      when t."isOutcomingPayment" is true then -abs(coalesce(t.total, 0))
      when t.type in (1, 3) then abs(coalesce(t.total, 0))
      when t.type in (2, 4) then -abs(coalesce(t.total, 0))
      else coalesce(t.total, 0)
    end as signed_total
  from transactions t
  left join payment_methods pm on pm.id = t."paymentMethodId"
  where t."accountId" = 8
    and t."isActive" = true
    and t.date <= '2026-06-01'
    and (t."accountPaymentFormId" is not null or t."paymentMethodId" is not null)
    and coalesce(t."isAccountReceivable", false) = false
    and not (
      coalesce(t."isAccountPayable", false) = true
      and not (coalesce(t.tags, '{}'::text[]) @> array['__payable_cash_in__'])
    )
    and not (coalesce(t.tags, '{}'::text[]) @> array['__inventory_adjustment__'])
    and not (coalesce(t.tags, '{}'::text[]) @> array['__prior_balance__'])
)
select
  round(sum(signed_total)::numeric, 2) as unassigned_cash_total
from filtered
where "accountPaymentFormId" is null
  and payment_method_code = 'cash';
