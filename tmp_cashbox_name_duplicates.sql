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
  and lower(name) like '%caja%'
order by lower(name), id;
