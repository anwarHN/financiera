import { supabase } from "../lib/supabase";

export async function getCurrentAccount(userId) {
  const { data, error } = await supabase
    .from("usersToAccounts")
    .select('accountId, accounts(id, name, "billingStatus", "trialEndsAt", "subscriptionCurrentPeriodEnd")')
    .eq("userId", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    accountId: data.accountId,
    accountName: data.accounts?.name ?? "",
    billingStatus: data.accounts?.billingStatus ?? "trialing",
    trialEndsAt: data.accounts?.trialEndsAt ?? null,
    subscriptionCurrentPeriodEnd: data.accounts?.subscriptionCurrentPeriodEnd ?? null
  };
}

export async function getAccountById(accountId) {
  const { data, error } = await supabase
    .from("accounts")
    .select('id, name, email, phone, address, "reportRetentionDays", "createdById"')
    .eq("id", accountId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateAccount(accountId, payload) {
  const { data, error } = await supabase
    .from("accounts")
    .update(payload)
    .eq("id", accountId)
    .select('id, name, email, phone, address, "reportRetentionDays", "createdById"')
    .single();

  if (error) {
    throw error;
  }

  return data;
}
