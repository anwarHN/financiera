import { supabase } from "../lib/supabase";

const selectColumns =
  'id, "accountId", "transactionType", "lastNumber", "numberFrom", "numberTo", "limitDate", "isActive", "printPattern", "reference1", "reference2", "createdById"';

export async function listCorrelativesControls(accountId) {
  const { data, error } = await supabase
    .from("correlatives_control")
    .select(selectColumns)
    .eq("accountId", accountId)
    .order("transactionType", { ascending: true })
    .order("id", { ascending: false });

  if (error) throw error;
  return data ?? [];
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
    .select(selectColumns)
    .single();

  if (error) throw error;
  return data;
}

export async function deactivateCorrelativeControl(id) {
  const { error } = await supabase.from("correlatives_control").update({ isActive: false }).eq("id", id);
  if (error) throw error;
}

export async function reserveTransactionCorrelative({ accountId, transactionType, transactionDate }) {
  const { data, error } = await supabase.rpc("reserve_transaction_correlative", {
    target_account_id: Number(accountId),
    target_transaction_type: Number(transactionType),
    target_date: transactionDate || null
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    controlId: Number(row?.control_id || 0),
    number: Number(row?.next_number || 0),
    printNumber: row?.print_number || ""
  };
}
