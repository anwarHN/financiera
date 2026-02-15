import { supabase } from "../lib/supabase";

export async function listCurrencies(accountId) {
  const { data, error } = await supabase
    .from("currencies")
    .select("id, name, symbol, isLocal")
    .or(`accountId.eq.${accountId},accountId.is.null`)
    .order("isLocal", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}
