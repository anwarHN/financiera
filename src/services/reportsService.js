import { supabase } from "../lib/supabase";

const PRIOR_BALANCE_TAG = "__prior_balance__";
const INVENTORY_ADJUSTMENT_TAG = "__inventory_adjustment__";

export async function getTransactionsForReports(accountId, { dateFrom, dateTo } = {}) {
  let query = supabase
    .from("transactions")
    .select(
      'id, personId, date, type, total, balance, payments, additionalCharges, isActive, isAccountPayable, isAccountReceivable, isIncomingPayment, isOutcomingPayment, "accountPaymentFormId", "projectId", currencyId, persons(name), account_payment_forms(name), projects(name)'
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

export async function getOutstandingTransactionsForReports(accountId, { reportId, dateFrom, dateTo, currencyId } = {}) {
  const asOfDate = dateTo || new Date().toISOString().slice(0, 10);
  const typeColumn = reportId === "receivable" ? "isAccountReceivable" : "isAccountPayable";

  let sourceQuery = supabase
    .from("transactions")
    .select("id, personId, date, type, total, currencyId, persons(name)")
    .eq("accountId", accountId)
    .eq("isActive", true)
    .eq(typeColumn, true)
    .lte("date", asOfDate);

  if (dateFrom) {
    sourceQuery = sourceQuery.gte("date", dateFrom);
  }
  if (currencyId) {
    sourceQuery = sourceQuery.eq("currencyId", Number(currencyId));
  }

  const { data: sourceRows, error: sourceError } = await sourceQuery;
  if (sourceError) throw sourceError;

  const txRows = (sourceRows ?? []).map((row) => ({
    ...row,
    id: Number(row.id),
    personId: Number(row.personId || 0),
    total: Math.abs(Number(row.total || 0))
  }));
  if (txRows.length === 0) return [];

  const txIds = txRows.map((row) => row.id).filter((id) => Number.isFinite(id) && id > 0);
  const { data: paymentRows, error: paymentRowsError } = await supabase
    .from("transactionDetails")
    .select("transactionId, transactionPaidId, total")
    .in("transactionPaidId", txIds);
  if (paymentRowsError) throw paymentRowsError;

  const paymentTxIds = Array.from(
    new Set((paymentRows ?? []).map((row) => Number(row.transactionId || 0)).filter((id) => Number.isFinite(id) && id > 0))
  );

  let validPaymentTxIds = new Set();
  if (paymentTxIds.length > 0) {
    let paymentTxQuery = supabase
      .from("transactions")
      .select("id")
      .eq("accountId", accountId)
      .eq("isActive", true)
      .lte("date", asOfDate)
      .in("id", paymentTxIds);

    if (currencyId) {
      paymentTxQuery = paymentTxQuery.eq("currencyId", Number(currencyId));
    }

    const { data: paidTransactions, error: paidTxError } = await paymentTxQuery;
    if (paidTxError) throw paidTxError;
    validPaymentTxIds = new Set((paidTransactions ?? []).map((tx) => Number(tx.id)));
  }

  const paidBySource = new Map();
  (paymentRows ?? []).forEach((row) => {
    const sourceId = Number(row.transactionPaidId || 0);
    const paymentId = Number(row.transactionId || 0);
    if (!validPaymentTxIds.has(paymentId) || !Number.isFinite(sourceId) || sourceId <= 0) return;
    paidBySource.set(sourceId, Number(paidBySource.get(sourceId) || 0) + Math.abs(Number(row.total || 0)));
  });

  return txRows
    .map((row) => ({
      ...row,
      balance: Math.max(Number(row.total || 0) - Number(paidBySource.get(row.id) || 0), 0)
    }))
    .filter((row) => Number(row.balance || 0) > 0);
}

export async function getCashflowConceptTotals(accountId, { dateFrom, dateTo, currencyId } = {}) {
  let txQuery = supabase
    .from("transactions")
    .select(
      "id, type, currencyId, isActive, tags, isIncomingPayment, isOutcomingPayment, isAccountReceivable, isAccountPayable, isInternalTransfer, isCashWithdrawal"
    )
    .eq("accountId", accountId)
    .eq("isActive", true);

  if (dateFrom) txQuery = txQuery.gte("date", dateFrom);
  if (dateTo) txQuery = txQuery.lte("date", dateTo);
  if (currencyId) txQuery = txQuery.eq("currencyId", Number(currencyId));

  const { data: transactions, error: txError } = await txQuery;
  if (txError) throw txError;

  const validTransactions = (transactions ?? []).filter((tx) => {
    const type = Number(tx.type);
    if (Boolean(tx.isInternalTransfer) && !Boolean(tx.isCashWithdrawal)) return false;
    if (Boolean(tx.isAccountReceivable) || Boolean(tx.isAccountPayable)) return false;
    if (Array.isArray(tx.tags) && tx.tags.includes(INVENTORY_ADJUSTMENT_TAG)) return false;
    const isCashSale = type === 1 && !Boolean(tx.isAccountReceivable);
    return type === 2 || type === 3 || type === 4 || isCashSale || Boolean(tx.isIncomingPayment) || Boolean(tx.isOutcomingPayment);
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

    const flowType = txMeta.type === 3 || txMeta.type === 1 || txMeta.isIncomingPayment ? "income" : "expense";
    const conceptName = detail.concepts?.name || "-";
    const parentConceptId = Number(detail.concepts?.parentConceptId || 0);
    const groupName = groupNameById.get(parentConceptId) || tbdGroupName(flowType);
    const rawAmount = Number(detail.total || 0);
    const normalizedAmount = flowType === "income" ? Math.abs(rawAmount) : -Math.abs(rawAmount);
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

export async function getCashflowBankBalances(accountId, { dateTo, currencyId } = {}) {
  const { data: forms, error: formsError } = await supabase
    .from("account_payment_forms")
    .select("id, name, provider, kind, isActive")
    .eq("accountId", accountId)
    .eq("isActive", true)
    .in("kind", ["bank_account", "cashbox"])
    .order("name", { ascending: true });
  if (formsError) throw formsError;

  let txQuery = supabase
    .from("transactions")
    .select(
      'id, type, total, currencyId, "accountPaymentFormId", "paymentMethodId", isActive, isIncomingPayment, isOutcomingPayment, isAccountReceivable, isAccountPayable, isInternalTransfer, isCashWithdrawal, tags, payment_methods(code)'
    )
    .eq("accountId", accountId)
    .eq("isActive", true)
    .or('accountPaymentFormId.not.is.null,paymentMethodId.not.is.null');

  if (dateTo) txQuery = txQuery.lte("date", dateTo);
  if (currencyId) txQuery = txQuery.eq("currencyId", Number(currencyId));

  const { data: transactions, error: txError } = await txQuery;
  if (txError) throw txError;

  const normalizeSignedTotal = (tx) => {
    const raw = Number(tx.total || 0);
    const abs = Math.abs(raw);
    if (tx.isIncomingPayment) return abs;
    if (tx.isOutcomingPayment) return -abs;
    const type = Number(tx.type);
    if (type === 1 || type === 3) return abs;
    if (type === 2 || type === 4) return -abs;
    return raw;
  };

  const filteredTransactions = (transactions ?? []).filter((tx) => {
    if (Boolean(tx.isInternalTransfer) && !Boolean(tx.isCashWithdrawal)) return false;
    if (Boolean(tx.isAccountReceivable) || Boolean(tx.isAccountPayable)) return false;
    if (Array.isArray(tx.tags) && tx.tags.includes(INVENTORY_ADJUSTMENT_TAG)) return false;
    if (Array.isArray(tx.tags) && tx.tags.includes(PRIOR_BALANCE_TAG)) return false;
    return true;
  });

  const totalsByFormId = new Map();
  filteredTransactions.forEach((tx) => {
    const formId = Number(tx.accountPaymentFormId || 0);
    if (!formId) return;
    totalsByFormId.set(formId, Number(totalsByFormId.get(formId) || 0) + normalizeSignedTotal(tx));
  });

  const rows = (forms ?? []).map((form) => ({
      id: form.id,
      name: form.name,
      provider: form.provider,
      balance: Number(totalsByFormId.get(Number(form.id)) || 0),
      kind: form.kind
    }));

  const cashTotal = filteredTransactions.reduce((acc, tx) => {
    if (tx.payment_methods?.code !== "cash") return acc;
    return acc + normalizeSignedTotal(tx);
  }, 0);

  const hasCashboxRows = rows.some((row) => row.kind === "cashbox");
  if (!hasCashboxRows) {
    rows.push({
      id: "cash-summary",
      name: "Efectivo",
      provider: "",
      balance: cashTotal,
      kind: "cashbox"
    });
  }

  return rows;
}

export async function getCashflowOutstandingBalanceSummary(accountId, { asOfDate, currencyId } = {}) {
  const resolvedDate = asOfDate || new Date().toISOString().slice(0, 10);

  const fetchBalanceByType = async (typeColumn) => {
    let sourceQuery = supabase
      .from("transactions")
      .select("id, total")
      .eq("accountId", accountId)
      .eq("isActive", true)
      .eq(typeColumn, true)
      .lte("date", resolvedDate)
      .not(typeColumn, "is", null);

    if (currencyId) {
      sourceQuery = sourceQuery.eq("currencyId", Number(currencyId));
    }

    const { data: sourceRows, error: sourceError } = await sourceQuery;
    if (sourceError) throw sourceError;

    const txRows = (sourceRows ?? []).map((row) => ({ id: Number(row.id), total: Number(row.total || 0) }));
    if (txRows.length === 0) return 0;

    const txIds = txRows.map((row) => row.id).filter((id) => Number.isFinite(id) && id > 0);
    if (!txIds.length) return 0;

    const { data: paymentRows, error: paymentRowsError } = await supabase
      .from("transactionDetails")
      .select("transactionId, transactionPaidId, total")
      .in("transactionPaidId", txIds);
    if (paymentRowsError) throw paymentRowsError;

    const paymentTxIds = (paymentRows ?? [])
      .map((row) => Number(row.transactionId || 0))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!paymentTxIds.length) return 0;

    const { data: paidTransactions, error: paidTxError } = await supabase
      .from("transactions")
      .select("id")
      .eq("accountId", accountId)
      .eq("isActive", true)
      .lte("date", resolvedDate)
      .in("id", paymentTxIds);

    if (paidTxError) throw paidTxError;

    const validPaymentTxIds = new Set((paidTransactions ?? []).map((tx) => Number(tx.id)));
    const paidBySource = new Map();
    (paymentRows ?? []).forEach((row) => {
      const sourceId = Number(row.transactionPaidId || 0);
      const paymentId = Number(row.transactionId || 0);
      if (!validPaymentTxIds.has(paymentId) || !Number.isFinite(sourceId) || sourceId <= 0) return;
      paidBySource.set(sourceId, Number(paidBySource.get(sourceId) || 0) + Math.abs(Number(row.total || 0)));
    });

    return txRows.reduce((acc, row) => {
      const total = Math.abs(row.total || 0);
      const paid = paidBySource.get(row.id) || 0;
      return acc + Math.max(total - paid, 0);
    }, 0);
  };

  const [receivable, payable] = await Promise.all([fetchBalanceByType("isAccountReceivable"), fetchBalanceByType("isAccountPayable")]);

  return {
    receivable,
    payable
  };
}

export async function getEmployeeAbsenceTotals(accountId, { dateFrom, dateTo } = {}) {
  let query = supabase
    .from("employee_absences")
    .select('id, employeeId, dateFrom, dateTo, isActive, employes(name)')
    .eq("accountId", accountId)
    .eq("isActive", true);

  if (dateFrom) query = query.gte("dateTo", dateFrom);
  if (dateTo) query = query.lte("dateFrom", dateTo);

  const { data, error } = await query;
  if (error) throw error;

  const grouped = new Map();
  (data ?? []).forEach((row) => {
    const employeeId = Number(row.employeeId || 0);
    const employeeName = row.employes?.name || "-";
    const key = `${employeeId}-${employeeName}`;
    const current = grouped.get(key) || {
      employeeId,
      employeeName,
      totalAbsences: 0
    };
    current.totalAbsences += 1;
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

export async function getSalesByEmployeeTotals(accountId, { dateFrom, dateTo, currencyId } = {}) {
  let txQuery = supabase
    .from("transactions")
    .select("id, currencyId, isActive, type")
    .eq("accountId", accountId)
    .eq("isActive", true)
    .eq("type", 1);

  if (dateFrom) txQuery = txQuery.gte("date", dateFrom);
  if (dateTo) txQuery = txQuery.lte("date", dateTo);
  if (currencyId) txQuery = txQuery.eq("currencyId", Number(currencyId));

  const { data: transactions, error: txError } = await txQuery;
  if (txError) throw txError;

  const txIds = (transactions ?? []).map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  if (txIds.length === 0) return [];

  const { data: details, error: detailsError } = await supabase
    .from("transactionDetails")
    .select("transactionId, quantity, total, sellerId, concepts(name), employes(name)")
    .in("transactionId", txIds);
  if (detailsError) throw detailsError;

  const bySeller = new Map();
  (details ?? []).forEach((row) => {
    const sellerId = Number(row.sellerId || 0);
    const sellerName = row.employes?.name || "Sin vendedor";
    const productName = row.concepts?.name || "-";
    const sellerKey = `${sellerId}-${sellerName}`;

    if (!bySeller.has(sellerKey)) {
      bySeller.set(sellerKey, {
        sellerId,
        sellerName,
        total: 0,
        products: new Map()
      });
    }

    const sellerGroup = bySeller.get(sellerKey);
    const amount = Number(row.total || 0);
    const quantity = Number(row.quantity || 0);
    sellerGroup.total += amount;

    const currentProduct = sellerGroup.products.get(productName) || {
      productName,
      quantity: 0,
      total: 0
    };
    currentProduct.quantity += quantity;
    currentProduct.total += amount;
    sellerGroup.products.set(productName, currentProduct);
  });

  return Array.from(bySeller.values())
    .sort((a, b) => a.sellerName.localeCompare(b.sellerName))
    .map((seller) => ({
      sellerId: seller.sellerId,
      sellerName: seller.sellerName,
      total: seller.total,
      products: Array.from(seller.products.values()).sort((a, b) => a.productName.localeCompare(b.productName))
    }));
}

export async function getExpensesByTagAndPaymentForm(accountId, { dateFrom, dateTo, currencyId } = {}) {
  let query = supabase
    .from("transactions")
    .select('id, total, tags, "accountPaymentFormId", account_payment_forms(name)')
    .eq("accountId", accountId)
    .eq("isActive", true)
    .eq("type", 2);

  if (dateFrom) query = query.gte("date", dateFrom);
  if (dateTo) query = query.lte("date", dateTo);
  if (currencyId) query = query.eq("currencyId", Number(currencyId));

  const { data, error } = await query;
  if (error) throw error;

  const grouped = new Map();
  (data ?? []).forEach((row) => {
    const paymentForm = row.account_payment_forms?.name || "Sin forma de pago";
    const tags = Array.isArray(row.tags) && row.tags.length > 0 ? row.tags : ["Sin etiqueta"];
    const amount = Math.abs(Number(row.total || 0));

    tags.forEach((rawTag) => {
      const tag = String(rawTag || "").trim() || "Sin etiqueta";
      const key = `${tag}::${paymentForm}`;
      const current = grouped.get(key) || { tag, paymentForm, total: 0 };
      current.total += amount;
      grouped.set(key, current);
    });
  });

  return Array.from(grouped.values()).sort((a, b) => {
    if (a.tag !== b.tag) return a.tag.localeCompare(b.tag);
    return a.paymentForm.localeCompare(b.paymentForm);
  });
}

export async function getEmployeeLoansReport(accountId, { dateFrom, dateTo, currencyId } = {}) {
  let query = supabase
    .from("transactions")
    .select('id, date, name, total, payments, balance, currencyId, "employeeId", employes(name)')
    .eq("accountId", accountId)
    .eq("isEmployeeLoan", true)
    .is("sourceTransactionId", null)
    .eq("isActive", true);

  if (dateFrom) query = query.gte("date", dateFrom);
  if (dateTo) query = query.lte("date", dateTo);
  if (currencyId) query = query.eq("currencyId", Number(currencyId));

  const { data, error } = await query.order("date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCashboxesBalanceReport(accountId, { dateFrom, dateTo, currencyId } = {}) {
  const { data: forms, error: formsError } = await supabase
    .from("account_payment_forms")
    .select("id, name, provider, reference, kind, isActive")
    .eq("accountId", accountId)
    .eq("isActive", true)
    .eq("kind", "cashbox")
    .order("name", { ascending: true });

  if (formsError) throw formsError;
  if (!forms?.length) return [];

  let txQuery = supabase
    .from("transactions")
    .select('id, total, currencyId, "accountPaymentFormId", isActive')
    .eq("accountId", accountId)
    .eq("isActive", true)
    .not("accountPaymentFormId", "is", null);

  if (dateFrom) txQuery = txQuery.gte("date", dateFrom);
  if (dateTo) txQuery = txQuery.lte("date", dateTo);
  if (currencyId) txQuery = txQuery.eq("currencyId", Number(currencyId));

  const { data: transactions, error: txError } = await txQuery;
  if (txError) throw txError;

  const totalsByFormId = new Map();
  (transactions ?? []).forEach((tx) => {
    const formId = Number(tx.accountPaymentFormId || 0);
    if (!formId) return;
    totalsByFormId.set(formId, Number(totalsByFormId.get(formId) || 0) + Number(tx.total || 0));
  });

  return forms.map((form) => ({
    id: form.id,
    name: form.name,
    provider: form.provider,
    reference: form.reference,
    balance: Number(totalsByFormId.get(Number(form.id)) || 0)
  }));
}

export async function getPendingDeliveriesReport(accountId, { dateFrom, dateTo, currencyId } = {}) {
  let txQuery = supabase
    .from("transactions")
    .select("id, date, total, currencyId, personId, persons(name)")
    .eq("accountId", accountId)
    .eq("isActive", true)
    .eq("type", 1);

  if (dateFrom) txQuery = txQuery.gte("date", dateFrom);
  if (dateTo) txQuery = txQuery.lte("date", dateTo);
  if (currencyId) txQuery = txQuery.eq("currencyId", Number(currencyId));

  const { data: txRows, error: txError } = await txQuery.order("date", { ascending: false });
  if (txError) throw txError;

  const txIds = (txRows ?? []).map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  if (!txIds.length) return [];

  const { data: detailRows, error: detailError } = await supabase
    .from("transactionDetails")
    .select("transactionId, conceptId, quantity, quantityDelivered, concepts(name)")
    .in("transactionId", txIds);
  if (detailError) throw detailError;

  const txById = new Map((txRows ?? []).map((row) => [Number(row.id), row]));
  const rows = [];
  (detailRows ?? []).forEach((row) => {
    const tx = txById.get(Number(row.transactionId));
    if (!tx) return;
    const quantity = Math.max(Number(row.quantity || 0), 0);
    const delivered = Math.max(Number(row.quantityDelivered || 0), 0);
    const pending = Math.max(quantity - delivered, 0);
    if (pending <= 0) return;
    rows.push({
      transactionId: tx.id,
      date: tx.date,
      personName: tx.persons?.name || "-",
      conceptName: row.concepts?.name || "-",
      quantity,
      quantityDelivered: delivered,
      pendingQuantity: pending,
      total: Number(tx.total || 0)
    });
  });

  return rows.sort((a, b) => {
    if (Number(b.transactionId || 0) !== Number(a.transactionId || 0)) return Number(b.transactionId || 0) - Number(a.transactionId || 0);
    return String(a.conceptName || "").localeCompare(String(b.conceptName || ""));
  });
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
