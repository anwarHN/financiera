with base as (
  select
    t.id,
    t.date,
    t.type,
    t.total,
    t.tags,
    t."isActive",
    t."isIncomingPayment",
    t."isOutcomingPayment",
    t."isAccountReceivable",
    t."isAccountPayable",
    t."isInternalTransfer",
    t."isDeposit",
    t."isCashWithdrawal",
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
  where t."accountId" = 8
    and t."accountPaymentFormId" = 17
    and t.date <= '2026-06-01'
    and (t."accountPaymentFormId" is not null or t."paymentMethodId" is not null)
)
select 'strict_current_logic' as variant, round(sum(signed_total)::numeric, 2) as balance
from base
where "isActive" = true
  and coalesce("isAccountReceivable", false) = false
  and not (coalesce("isAccountPayable", false) = true and not (coalesce(tags, '{}'::text[]) @> array['__payable_cash_in__']))
  and not (coalesce(tags, '{}'::text[]) @> array['__inventory_adjustment__'])
  and not (coalesce(tags, '{}'::text[]) @> array['__prior_balance__'])
union all
select 'including_inactive', round(sum(signed_total)::numeric, 2)
from base
where coalesce("isAccountReceivable", false) = false
  and not (coalesce("isAccountPayable", false) = true and not (coalesce(tags, '{}'::text[]) @> array['__payable_cash_in__']))
  and not (coalesce(tags, '{}'::text[]) @> array['__inventory_adjustment__'])
  and not (coalesce(tags, '{}'::text[]) @> array['__prior_balance__'])
union all
select 'including_account_payable', round(sum(signed_total)::numeric, 2)
from base
where "isActive" = true
  and coalesce("isAccountReceivable", false) = false
  and not (coalesce(tags, '{}'::text[]) @> array['__inventory_adjustment__'])
  and not (coalesce(tags, '{}'::text[]) @> array['__prior_balance__'])
union all
select 'including_prior_balance', round(sum(signed_total)::numeric, 2)
from base
where "isActive" = true
  and coalesce("isAccountReceivable", false) = false
  and not (coalesce("isAccountPayable", false) = true and not (coalesce(tags, '{}'::text[]) @> array['__payable_cash_in__']))
  and not (coalesce(tags, '{}'::text[]) @> array['__inventory_adjustment__'])
union all
select 'including_receivables', round(sum(signed_total)::numeric, 2)
from base
where "isActive" = true
  and not (coalesce("isAccountPayable", false) = true and not (coalesce(tags, '{}'::text[]) @> array['__payable_cash_in__']))
  and not (coalesce(tags, '{}'::text[]) @> array['__inventory_adjustment__'])
  and not (coalesce(tags, '{}'::text[]) @> array['__prior_balance__'])
union all
select 'including_everything_active', round(sum(signed_total)::numeric, 2)
from base
where "isActive" = true;
