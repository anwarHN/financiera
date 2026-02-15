import { supabase } from "../lib/supabase";

export async function getTransactionsForReports(accountId, { dateFrom, dateTo } = {}) {
  let query = supabase
    .from("transactions")
    .select(
      'id, date, type, total, balance, payments, isActive, isAccountPayable, isAccountReceivable, isIncomingPayment, isOutcomingPayment, "accountPaymentFormId", currencyId, account_payment_forms(name)'
    )
    .eq("accountId", accountId)
    .eq("isActive", true);

  if (dateFrom) {
    query = query.gte("date", dateFrom);
  }
  if (dateTo) {
    query = query.lte("date", dateTo);
  }

  const { data, error } = await query.order("date", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function exportReportXlsx({
  accountId,
  reportId,
  dateFrom,
  dateTo,
  currencyId
}) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
  }

  async function getValidAccessToken() {
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
      throw new Error("Missing auth session for report export request.");
    }

    return session.access_token;
  }

  async function callExport(accessToken) {
    const response = await fetch(`${supabaseUrl}/functions/v1/export-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ accountId, reportId, dateFrom, dateTo, currencyId })
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    return { response, payload };
  }

  let accessToken = await getValidAccessToken();
  let { response, payload } = await callExport(accessToken);

  if (response.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    accessToken = refreshed.data.session?.access_token;
    if (!accessToken) {
      throw new Error(payload?.error ?? "Unauthorized. Please sign in again.");
    }
    const retry = await callExport(accessToken);
    response = retry.response;
    payload = retry.payload;
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? `Report export HTTP ${response.status}`);
  }

  if (payload?.success === false || !payload?.downloadUrl) {
    throw new Error(`Report export failed: ${payload?.error ?? "unknown function error"}`);
  }

  return payload;
}
