with filtered as (
  select
    t."accountPaymentFormId" as form_id,
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
    and t."isActive" = true
    and t.date <= '2026-06-01'
    and t."accountPaymentFormId" is not null
)
select
  apf.id,
  apf.name,
  apf.provider,
  apf.reference,
  apf."isActive",
  round(sum(f.signed_total)::numeric, 2) as raw_balance
from filtered f
join account_payment_forms apf on apf.id = f.form_id
where apf."accountId" = 8
  and lower(apf.name) like '%caja%'
group by apf.id, apf.name, apf.provider, apf.reference, apf."isActive"
order by apf.id;
