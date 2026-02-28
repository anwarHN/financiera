-- Cashboxes must never generate internal payables on outgoing payments.

update public.account_payment_forms
set "createInternalPayableOnOutgoingPayment" = false
where kind = 'cashbox'
  and coalesce("createInternalPayableOnOutgoingPayment", false) = true;

