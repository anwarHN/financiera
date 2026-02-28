import { supabase } from "../lib/supabase";

const selectColumns = "id, name, phone, address, type";
const personTransactionsSelectColumns =
  'id, date, type, total, balance, payments, isAccountReceivable, isAccountPayable, isActive';

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

export async function listPersonAccountTransactions(accountId, personId, kind) {
  let query = supabase
    .from("transactions")
    .select(personTransactionsSelectColumns)
    .eq("accountId", accountId)
    .eq("personId", personId)
    .eq("isActive", true);

  if (kind === "receivable") {
    query = query.eq("isAccountReceivable", true);
  } else if (kind === "payable") {
    query = query.eq("isAccountPayable", true);
  }

  const { data, error } = await query
    .order("date", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}
