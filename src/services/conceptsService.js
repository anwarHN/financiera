import { supabase } from "../lib/supabase";

const selectColumns =
  "id, name, parentConceptId, parentConcept:concepts(name), isGroup, isIncome, isExpense, isProduct, isPaymentForm, isAccountPayableConcept, isIncomingPaymentConcept, isOutgoingPaymentConcept, isSystem, taxPercentage, price, additionalCharges";

export async function listConcepts(accountId) {
  const { data, error } = await supabase
    .from("concepts")
    .select(selectColumns)
    .eq("accountId", accountId)
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function listConceptsByModule(accountId, moduleType) {
  let query = supabase.from("concepts").select(selectColumns).eq("accountId", accountId);

  if (moduleType === "products") {
    query = query.eq("isProduct", true).eq("isGroup", false);
  }

  if (moduleType === "income") {
    query = query.eq("isIncome", true).eq("isProduct", false).eq("isGroup", false).eq("isIncomingPaymentConcept", false);
  }

  if (moduleType === "expense") {
    query = query
      .eq("isExpense", true)
      .eq("isGroup", false)
      .eq("isOutgoingPaymentConcept", false)
      .eq("isAccountPayableConcept", false);
  }

  if (moduleType === "groups") {
    query = query.eq("isGroup", true);
  }

  if (moduleType === "payable") {
    query = query.eq("isAccountPayableConcept", true).eq("isGroup", false);
  }

  const { data, error } = await query.order("id", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getConceptById(id) {
  const { data, error } = await supabase.from("concepts").select(selectColumns).eq("id", id).single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createConcept(payload) {
  const { data, error } = await supabase.from("concepts").insert(payload).select(selectColumns).single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateConcept(id, payload) {
  const { data, error } = await supabase
    .from("concepts")
    .update(payload)
    .eq("id", id)
    .select(selectColumns)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteConcept(id) {
  const { error } = await supabase.from("concepts").delete().eq("id", id);

  if (error) {
    throw error;
  }
}
