select
  t.id,
  t.date,
  t.type,
  t.name,
  t.total,
  t.balance,
  t.tags,
  t."accountId",
  t."personId",
  t."currencyId",
  t."paymentMethodId",
  pm.code as payment_method_code,
  t."accountPaymentFormId",
  apf.name as account_payment_form_name,
  apf.kind as account_payment_form_kind,
  t."isActive",
  t."isIncomingPayment",
  t."isOutcomingPayment",
  t."isAccountReceivable",
  t."isAccountPayable",
  t."isInternalTransfer",
  t."isDeposit",
  t."isCashWithdrawal",
  t."isReconciled",
  t."reconciledAt",
  t."referenceNumber",
  t."sourceTransactionId",
  t."created_at"
from transactions t
left join payment_methods pm on pm.id = t."paymentMethodId"
left join account_payment_forms apf on apf.id = t."accountPaymentFormId"
where t.id in (1591, 1592, 1593)
order by t.id;
