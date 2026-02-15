import { supabase } from "../lib/supabase";

async function getAccessToken() {
  let {
    data: { session }
  } = await supabase.auth.getSession();

  const shouldRefresh =
    !session?.access_token ||
    !session?.expires_at ||
    session.expires_at * 1000 <= Date.now() + 60_000;

  if (shouldRefresh) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }

  if (!session?.access_token) {
    throw new Error("Missing auth session.");
  }

  return session.access_token;
}

async function invokeBillingFunction(functionName, payload) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
  }

  const accessToken = await getAccessToken();
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error ?? `Billing request failed (${response.status})`);
  }

  if (!data?.success) {
    throw new Error(data?.error ?? "Billing request failed.");
  }

  return data;
}

export function createCheckoutSession({ accountId, appUrl }) {
  return invokeBillingFunction("create-billing-checkout", { accountId, appUrl });
}

export function createPortalSession({ accountId, appUrl }) {
  return invokeBillingFunction("create-billing-portal", { accountId, appUrl });
}

export function syncBillingSeats({ accountId }) {
  return invokeBillingFunction("sync-billing-seats", { accountId });
}

export function listBillingPaymentMethods({ accountId }) {
  return invokeBillingFunction("list-billing-payment-methods", { accountId });
}

export function createBillingSetupSession({ accountId, appUrl }) {
  return invokeBillingFunction("create-billing-setup-session", { accountId, appUrl });
}

export function setDefaultBillingPaymentMethod({ accountId, paymentMethodId }) {
  return invokeBillingFunction("set-default-billing-payment-method", { accountId, paymentMethodId });
}
