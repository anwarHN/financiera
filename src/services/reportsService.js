import { supabase } from "../lib/supabase";

export async function getTransactionsForReports(accountId, { dateFrom, dateTo } = {}) {
  let query = supabase
    .from("transactions")
    .select(
      'id, date, type, total, balance, payments, additionalCharges, isActive, isAccountPayable, isAccountReceivable, isIncomingPayment, isOutcomingPayment, "accountPaymentFormId", "projectId", currencyId, account_payment_forms(name), projects(name)'
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

export async function getCashflowConceptTotals(accountId, { dateFrom, dateTo, currencyId } = {}) {
  let txQuery = supabase
    .from("transactions")
    .select("id, type, currencyId, isActive, isIncomingPayment, isOutcomingPayment")
    .eq("accountId", accountId)
    .eq("isActive", true);

  if (dateFrom) txQuery = txQuery.gte("date", dateFrom);
  if (dateTo) txQuery = txQuery.lte("date", dateTo);
  if (currencyId) txQuery = txQuery.eq("currencyId", Number(currencyId));

  const { data: transactions, error: txError } = await txQuery;
  if (txError) throw txError;

  const validTransactions = (transactions ?? []).filter((tx) => {
    const type = Number(tx.type);
    return type === 2 || type === 3 || Boolean(tx.isIncomingPayment) || Boolean(tx.isOutcomingPayment);
  });
  if (validTransactions.length === 0) return [];

  const txMetaById = new Map(
    validTransactions.map((tx) => [
      Number(tx.id),
      {
        type: Number(tx.type),
        isIncomingPayment: Boolean(tx.isIncomingPayment),
        isOutcomingPayment: Boolean(tx.isOutcomingPayment)
      }
    ])
  );
  const txIds = validTransactions.map((tx) => Number(tx.id));

  const { data: details, error: detailsError } = await supabase
    .from("transactionDetails")
    .select("transactionId, total, conceptId, concepts(id, name, parentConceptId)")
    .in("transactionId", txIds);

  if (detailsError) throw detailsError;

  const parentConceptIds = Array.from(
    new Set(
      (details ?? [])
        .map((detail) => Number(detail.concepts?.parentConceptId || 0))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  let groupNameById = new Map();
  if (parentConceptIds.length > 0) {
    const { data: groupConcepts, error: groupsError } = await supabase
      .from("concepts")
      .select("id, name")
      .in("id", parentConceptIds);
    if (groupsError) throw groupsError;
    groupNameById = new Map((groupConcepts ?? []).map((row) => [Number(row.id), row.name || "-"]));
  }

  const grouped = new Map();

  for (const detail of details ?? []) {
    const txMeta = txMetaById.get(Number(detail.transactionId));
    if (!txMeta) continue;

    const flowType = txMeta.type === 3 || txMeta.isIncomingPayment ? "income" : "expense";
    const conceptName = detail.concepts?.name || "-";
    const parentConceptId = Number(detail.concepts?.parentConceptId || 0);
    const groupName = groupNameById.get(parentConceptId) || tbdGroupName(flowType);
    const normalizedAmount = Number(detail.total || 0);
    const key = `${flowType}::${groupName}::${conceptName}`;

    grouped.set(key, {
      flowType,
      groupName,
      conceptName,
      total: Number(grouped.get(key)?.total || 0) + normalizedAmount
    });
  }

  return Array.from(grouped.values());
}

function tbdGroupName(flowType) {
  return flowType === "income" ? "Sin grupo (ingresos)" : "Sin grupo (gastos)";
}

export async function exportReportXlsx({
  accountId,
  reportId,
  dateFrom,
  dateTo,
  currencyId,
  budgetId,
  projectId
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
      body: JSON.stringify({ accountId, reportId, dateFrom, dateTo, currencyId, budgetId, projectId })
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
