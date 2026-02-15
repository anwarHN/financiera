import { supabase } from "../lib/supabase";

const selectColumns = "id, name, phone, address, type";

export async function listPersons(accountId) {
  const { data, error } = await supabase
    .from("persons")
    .select(selectColumns)
    .eq("accountId", accountId)
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listPersonsByType(accountId, type) {
  const { data, error } = await supabase
    .from("persons")
    .select(selectColumns)
    .eq("accountId", accountId)
    .eq("type", type)
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getPersonById(id) {
  const { data, error } = await supabase.from("persons").select(selectColumns).eq("id", id).single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createPerson(payload) {
  const { data, error } = await supabase.from("persons").insert(payload).select(selectColumns).single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updatePerson(id, payload) {
  const { data, error } = await supabase
    .from("persons")
    .update(payload)
    .eq("id", id)
    .select(selectColumns)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deletePerson(id) {
  const { error } = await supabase.from("persons").delete().eq("id", id);

  if (error) {
    throw error;
  }
}
