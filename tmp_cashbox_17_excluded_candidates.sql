select
  t.id,
  t.date,
  t.type,
  t.name,
  t.total,
  t."isActive",
  t."isIncomingPayment",
  t."isOutcomingPayment",
  t."isAccountReceivable",
  t."isAccountPayable",
  t."isInternalTransfer",
  t."isDeposit",
  t."isCashWithdrawal",
  t.tags
from transactions t
where t."accountId" = 8
  and t."accountPaymentFormId" = 17
  and t.date <= '2026-06-01'
  and (
    t."isActive" = false
    or coalesce(t."isAccountReceivable", false) = true
    or coalesce(t."isAccountPayable", false) = true
    or coalesce(t.tags, '{}'::text[]) @> array['__inventory_adjustment__']
    or coalesce(t.tags, '{}'::text[]) @> array['__prior_balance__']
  )
order by t.date, t.id;
