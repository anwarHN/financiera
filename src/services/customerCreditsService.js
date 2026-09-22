import { supabase } from "../lib/supabase";
import { loadCreditEntries } from "../../supabase/functions/_shared/customerCredits.js";

export const listCustomerCredits = (accountId, asOf, currencyId) => loadCreditEntries(supabase, accountId, asOf, currencyId);

export async function customerCreditCommand(accountId, form, requestId) {
  const { data, error } = await supabase.rpc("customer_credit_command", {
    p_account: Number(accountId), p_action: form.action, p_person: Number(form.personId) || null,
    p_currency: Number(form.currencyId) || null, p_amount: Number(form.amount) || null,
    p_date: form.date, p_reference: form.reference, p_credit: Number(form.creditId) || null,
    p_invoice: Number(form.invoiceId) || null, p_method: Number(form.paymentMethodId) || null,
    p_form: Number(form.accountPaymentFormId) || null, p_request: requestId
  });
  if (error) throw error;
  return data;
}
