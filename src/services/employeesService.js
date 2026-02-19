import { supabase } from "../lib/supabase";

const selectColumns = "id, name, phone, email, address, isPartner, isActive";

export async function listEmployees(accountId, { includeInactive = false } = {}) {
  let query = supabase.from("employes").select(selectColumns).eq("accountId", accountId).order("id", { ascending: false });

  if (!includeInactive) {
    query = query.eq("isActive", true);
  }

  const { data, error } = await query;

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

export async function deactivateEmployee(id) {
  const { data, error } = await supabase.from("employes").update({ isActive: false }).eq("id", id).select(selectColumns).single();

  if (error) {
    throw error;
  }

  return data;
}
