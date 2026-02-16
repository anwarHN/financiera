import { supabase } from "../lib/supabase";

export async function listUserAccounts(userId) {
  const { data, error } = await supabase
    .from("usersToAccounts")
    .select('accountId, accounts(id, name, "createdById", "billingStatus", "trialEndsAt", "subscriptionCurrentPeriodEnd")')
    .eq("userId", userId)
    .order("accountId", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    accountId: row.accountId,
    accountName: row.accounts?.name ?? "",
    isOriginalAccount: row.accounts?.createdById === userId,
    billingStatus: row.accounts?.billingStatus ?? "trialing",
    trialEndsAt: row.accounts?.trialEndsAt ?? null,
    subscriptionCurrentPeriodEnd: row.accounts?.subscriptionCurrentPeriodEnd ?? null
  }));
}

export async function getCurrentAccount(userId) {
  const accounts = await listUserAccounts(userId);
  if (accounts.length === 0) {
    return null;
  }

  return accounts[0];
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
