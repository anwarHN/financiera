import { supabase } from "../lib/supabase";

const LOCAL_PRINT_SERVICE_URL = "http://127.0.0.1:18080/";

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

export async function printInvoiceTxt({ accountId, transactionId }) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
  }

  const accessToken = await getAccessToken();
  const response = await fetch(`${supabaseUrl}/functions/v1/generate-invoice-print-txt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ accountId, transactionId })
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? `Invoice print request failed (${response.status})`);
  }

  if (!payload?.success || !payload?.downloadUrl) {
    throw new Error(payload?.error ?? "Invoice print request failed.");
  }

  const localUrl = `${LOCAL_PRINT_SERVICE_URL}?data=${encodeURIComponent(payload.downloadUrl)}&close=1`;
  await fetch(localUrl, {
    method: "GET",
    mode: "no-cors",
    cache: "no-store"
  });

  return payload;
}
