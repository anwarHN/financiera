import { supabase } from "../lib/supabase";
import { fetchAllPages } from "../../supabase/functions/_shared/fetchAllPages.js";

const selectColumns =
  'id, "accountId", "transactionType", "lastNumber", "numberFrom", "numberTo", "limitDate", "isActive", "printPattern", "reference1", "reference2", "createdById"';

export async function listCorrelativesControls(accountId) {
  return fetchAllPages((from, to) => supabase
    .from("correlatives_control")
    .select(selectColumns)
    .eq("accountId", accountId)
    .order("transactionType", { ascending: true })
    .order("id", { ascending: false }).range(from, to));
}

export async function createCorrelativeControl(payload) {
  const { data, error } = await supabase
    .from("correlatives_control")
    .insert(payload)
    .select(selectColumns)
    .single();

  if (error) throw error;
  return data;
}

export async function updateCorrelativeControl(id, payload) {
  const { data, error } = await supabase
    .from("correlatives_control")
    .update(payload)
    .eq("id", id)
    .eq("accountId", payload.accountId)
    .select(selectColumns)
    .single();

  if (error) throw error;
  return data;
}

export async function deactivateCorrelativeControl(id, accountId) {
  const { error } = await supabase.from("correlatives_control").update({ isActive: false }).eq("id", id).eq("accountId", accountId);
  if (error) throw error;
}
