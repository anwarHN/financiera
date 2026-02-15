import { supabase } from "../lib/supabase";

const selectColumns =
  'id, "accountId", name, kind, provider, reference, "employeeId", "createInternalPayableOnOutgoingPayment", "isActive"';

export async function listAccountPaymentForms(accountId) {
  const { data, error } = await supabase
    .from("account_payment_forms")
    .select(selectColumns)
    .eq("accountId", accountId)
    .eq("isActive", true)
    .order("id", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAccountPaymentFormById(id) {
  const { data, error } = await supabase.from("account_payment_forms").select(selectColumns).eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createAccountPaymentForm(payload) {
  const { data, error } = await supabase.from("account_payment_forms").insert(payload).select(selectColumns).single();
  if (error) throw error;
  return data;
}

export async function updateAccountPaymentForm(id, payload) {
  const { data, error } = await supabase
    .from("account_payment_forms")
    .update(payload)
    .eq("id", id)
    .select(selectColumns)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAccountPaymentForm(id) {
  const { error } = await supabase.from("account_payment_forms").update({ isActive: false }).eq("id", id);
  if (error) throw error;
}
