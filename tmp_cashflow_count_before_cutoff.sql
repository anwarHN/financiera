select
  count(*) as total_before_cutoff
from transactions
where "accountId" = 8
  and "isActive" = true
  and date <= '2026-06-01'
  and ("accountPaymentFormId" is not null or "paymentMethodId" is not null);
