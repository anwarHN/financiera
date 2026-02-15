import { supabase } from "../lib/supabase";

const selectColumns =
  'id, name, "isSystemAdmin", "canCreateUsers", "canCreateProfiles", "canVoidTransactions", permissions';

export async function listProfiles(accountId) {
  const { data, error } = await supabase
    .from("account_profiles")
    .select(selectColumns)
    .eq("accountId", accountId)
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createProfile(payload) {
  const { data, error } = await supabase.from("account_profiles").insert(payload).select(selectColumns).single();
  if (error) throw error;
  return data;
}

export async function updateProfile(id, payload) {
  const { data, error } = await supabase
    .from("account_profiles")
    .update(payload)
    .eq("id", id)
    .select(selectColumns)
    .single();

  if (error) throw error;
  return data;
}

export async function listUserProfiles(accountId) {
  const { data, error } = await supabase
    .from("users_to_profiles")
    .select('id, "userId", "profileId", account_profiles(name)')
    .eq("accountId", accountId)
    .order("id", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function assignUserProfile({ accountId, userId, profileId }) {
  const { error: deleteError } = await supabase
    .from("users_to_profiles")
    .delete()
    .eq("accountId", accountId)
    .eq("userId", userId);
  if (deleteError) throw deleteError;

  const { error } = await supabase.from("users_to_profiles").insert({ accountId, userId, profileId });
  if (error) throw error;
}

export async function getCurrentUserProfile(accountId, userId) {
  const { data, error } = await supabase
    .from("users_to_profiles")
    .select('id, "profileId", account_profiles(id, name, "isSystemAdmin")')
    .eq("accountId", accountId)
    .eq("userId", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
