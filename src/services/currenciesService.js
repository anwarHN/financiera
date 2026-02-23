import { supabase } from "../lib/supabase";

export async function listCurrencies(accountId) {
  const { data, error } = await supabase
    .from("currencies")
    .select("id, name, symbol, isLocal, accountId")
    .or(`accountId.eq.${accountId},accountId.is.null`)
    .order("isLocal", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createCurrency(payload) {
  if (payload?.isLocal) {
    await supabase.from("currencies").update({ isLocal: false }).eq("accountId", payload.accountId);
  }

  const { data, error } = await supabase
    .from("currencies")
    .insert(payload)
    .select("id, name, symbol, isLocal, accountId")
    .single();

  if (error) throw error;
  return data;
}

export async function updateCurrency(id, payload) {
  if (payload?.isLocal && payload?.accountId) {
    await supabase.from("currencies").update({ isLocal: false }).eq("accountId", payload.accountId);
  }

  const { data, error } = await supabase
    .from("currencies")
    .update(payload)
    .eq("id", id)
    .select("id, name, symbol, isLocal, accountId")
    .single();

  if (error) throw error;
  return data;
}
