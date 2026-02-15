import { supabase } from "../lib/supabase";

export async function listPaymentMethods(accountId) {
  const { data, error } = await supabase
    .from("payment_methods")
    .select('id, "accountId", code, name, is_active')
    .eq("accountId", accountId)
    .eq("is_active", true)
    .order("id");
  if (error) throw error;
  return data ?? [];
}
