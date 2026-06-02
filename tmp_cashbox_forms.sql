select
  id,
  name,
  provider,
  reference,
  kind,
  "accountId",
  "isActive"
from account_payment_forms
where "accountId" = 8
  and kind = 'cashbox'
order by id;
