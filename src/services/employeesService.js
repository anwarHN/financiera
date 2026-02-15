import { supabase } from "../lib/supabase";

const selectColumns = "id, name, phone, email, address, isPartner";

export async function listEmployees(accountId) {
  const { data, error } = await supabase
    .from("employes")
    .select(selectColumns)
    .eq("accountId", accountId)
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getEmployeeById(id) {
  const { data, error } = await supabase.from("employes").select(selectColumns).eq("id", id).single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createEmployee(payload) {
  const { data, error } = await supabase.from("employes").insert(payload).select(selectColumns).single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateEmployee(id, payload) {
  const { data, error } = await supabase
    .from("employes")
    .update(payload)
    .eq("id", id)
    .select(selectColumns)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteEmployee(id) {
  const { error } = await supabase.from("employes").delete().eq("id", id);

  if (error) {
    throw error;
  }
}
