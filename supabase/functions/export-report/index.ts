import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
const INVENTORY_ADJUSTMENT_TAG = "__inventory_adjustment__";
const PRIOR_BALANCE_TAG = "__prior_balance__";

interface ExportPayload {
  accountId: number;
  reportId:
    | "sales"
    | "receivable"
    | "payable"
    | "internal_obligations"
    | "expenses"
    | "cashflow"
    | "employee_absences"
    | "sales_by_employee"
    | "expenses_by_tag_payment_form"
    | "employee_loans"
    | "employee_payroll"
    | "cashboxes_balance"
    | "pending_deliveries";
  dateFrom?: string | null;
  dateTo?: string | null;
  currencyId?: number | null;
}

type BaseTxRow = {
  id: number;
  date: string;
  type: number;
  total: number;
  balance: number;
  isAccountPayable: boolean;
  isAccountReceivable: boolean;
  currencyId: number | null;
  personId: number | null;
  persons: {
    name: string;
  } | null;
};

type InternalObligationRow = {
  id: number;
  date: string;
  name: string;
  total: number;
  balance: number;
  currencyId: number | null;
};

type CashflowTxRow = {
  id: number;
  date: string;
  type: number;
  total: number;
  currencyId: number | null;
  tags: string[] | null;
  isIncomingPayment: boolean;
  isOutcomingPayment: boolean;
  isAccountReceivable: boolean;
  isAccountPayable: boolean;
  isInternalTransfer: boolean;
  isDeposit: boolean;
  isCashWithdrawal: boolean;
};

type CashflowConceptDetail = {
  transactionId: number;
  total: number;
  conceptId: number;
  concepts: {
    id: number;
    name: string;
    parentConceptId: number | null;
  } | null;
};

type CashflowGroupedRow = {
  section: string;
  group: string;
  concept: string;
  total: number;
};

type ExportAdditionalSheet = {
  name: string;
  rows: Record<string, string | number>[];
};

type ExportBuildResult = {
  rows: Record<string, string | number>[];
  total: number;
  balance: number;
  extras?: Array<[string, string | number]>;
  additionalSheets?: ExportAdditionalSheet[];
};

type CashflowBankBalanceRow = {
  id: number;
  name: string;
  provider: string | null;
  kind: string;
  balance: number;
};

type SalesByEmployeeTxRow = {
  id: number;
};

type SalesByEmployeeDetailRow = {
  transactionId: number;
  quantity: number;
  total: number;
  sellerId: number | null;
  concepts: {
    name: string;
  } | null;
  employes: {
    name: string;
  } | null;
};

type ExpensesByTagAndPaymentFormRow = {
  id: number;
  total: number;
  tags: string[] | null;
  account_payment_forms: {
    name: string;
  } | null;
};

type EmployeeLoanReportRow = {
  id: number;
  date: string;
  name: string;
  total: number;
  payments: number;
  balance: number;
  employes: {
    name: string;
  } | null;
};

type CashboxBalanceRow = {
  id: number;
  name: string;
  provider: string | null;
  reference: string | null;
  kind: string;
  isActive: boolean;
};

type PendingDeliveryTxRow = {
  id: number;
  date: string;
  total: number;
  currencyId: number | null;
  persons: { name: string } | null;
};

type PendingDeliveryDetailRow = {
  id: number;
  transactionId: number;
  quantity: number;
  quantityDelivered: number | null;
  historicalQuantityDelivered?: number | null;
  concepts: { name: string } | null;
};

const reportTitles: Record<ExportPayload["reportId"], string> = {
  sales: "Ventas",
  receivable: "Cuentas por cobrar",
  payable: "Cuentas por pagar",
  internal_obligations: "Obligaciones internas",
  expenses: "Gastos",
  cashflow: "Flujo de caja",
  employee_absences: "Ausencias por empleado",
  sales_by_employee: "Ventas por empleado",
  expenses_by_tag_payment_form: "Gastos por etiqueta y forma de pago",
  employee_loans: "Préstamos a empleados",
  employee_payroll: "Planilla de empleados",
  cashboxes_balance: "Saldos de cajas",
  pending_deliveries: "Pendientes de entrega"
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function txTypeLabel(type: number) {
  if (type === 1) return "Venta";
  if (type === 2) return "Gasto";
  if (type === 3) return "Ingreso";
  if (type === 4) return "Compra";
  if (type === 5) return "Pago saliente";
  if (type === 6) return "Pago entrante";
  return "Transacción";
}

function sanitizeNumber(value: unknown) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeDate(value?: string | null) {
  return value ? value : "-";
}

function previousDate(date: string) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function authenticateRequest(supabaseAdmin: ReturnType<typeof createClient>, req: Request, accountId: number) {
  const authHeader = req.headers.get("Authorization") || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    throw new Error("Missing bearer token");
  }

  const {
    data: { user },
    error: userError
  } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !user) {
    throw new Error(`Invalid token: ${userError?.message ?? "unknown"}`);
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("usersToAccounts")
    .select('"userId","accountId"')
    .eq("userId", user.id)
    .eq("accountId", accountId)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("Forbidden for this account");
  }
}

async function fetchBaseTransactions(supabaseAdmin: ReturnType<typeof createClient>, payload: ExportPayload) {
  let txQuery = supabaseAdmin
    .from("transactions")
    .select('id, date, type, total, balance, isAccountPayable, isAccountReceivable, currencyId, personId, persons(name)')
    .eq("accountId", payload.accountId)
    .eq("isActive", true)
    .order("date", { ascending: false });

  if (payload.dateFrom) txQuery = txQuery.gte("date", payload.dateFrom);
  if (payload.dateTo) txQuery = txQuery.lte("date", payload.dateTo);
  if (payload.currencyId != null) txQuery = txQuery.eq("currencyId", payload.currencyId);

  const { data, error } = await txQuery;
  if (error) throw error;
  return (data ?? []) as BaseTxRow[];
}

async function fetchOutstandingTransactionsAsOf(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ExportPayload
) {
  const asOfDate = payload.dateTo || new Date().toISOString().slice(0, 10);
  const isReceivable = payload.reportId === "receivable";

  let sourceQuery = supabaseAdmin
    .from("transactions")
    .select('id, date, type, total, currencyId, personId, persons(name)')
    .eq("accountId", payload.accountId)
    .eq("isActive", true)
    .eq(isReceivable ? "isAccountReceivable" : "isAccountPayable", true)
    .lte("date", asOfDate);

  if (payload.currencyId != null) sourceQuery = sourceQuery.eq("currencyId", payload.currencyId);

  const { data: sourceRows, error: sourceError } = await sourceQuery.order("date", { ascending: false });
  if (sourceError) throw sourceError;

  const txRows = (sourceRows ?? []).map((row) => ({
    ...row,
    id: Number(row.id),
    total: Math.abs(Number(row.total || 0))
  }));
  if (!txRows.length) return [];

  const txIds = txRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  const { data: paymentRows, error: paymentRowsError } = await supabaseAdmin
    .from("transactionDetails")
    .select("transactionId, transactionPaidId, total")
    .in("transactionPaidId", txIds);
  if (paymentRowsError) throw paymentRowsError;

  const paymentTxIds = Array.from(
    new Set((paymentRows ?? []).map((row) => Number(row.transactionId || 0)).filter((id) => Number.isFinite(id) && id > 0))
  );

  let validPaymentTxIds = new Set<number>();
  if (paymentTxIds.length > 0) {
    let paidTransactionsQuery = supabaseAdmin
      .from("transactions")
      .select("id")
      .eq("accountId", payload.accountId)
      .eq("isActive", true)
      .lte("date", asOfDate)
      .in("id", paymentTxIds);

    if (payload.currencyId != null) paidTransactionsQuery = paidTransactionsQuery.eq("currencyId", payload.currencyId);

    const { data: paidTransactions, error: paidTxError } = await paidTransactionsQuery;
    if (paidTxError) throw paidTxError;
    validPaymentTxIds = new Set((paidTransactions ?? []).map((tx) => Number(tx.id)));
  }

  const paidBySource = new Map<number, number>();
  (paymentRows ?? []).forEach((row) => {
    const sourceId = Number(row.transactionPaidId || 0);
    const paymentId = Number(row.transactionId || 0);
    if (!validPaymentTxIds.has(paymentId) || !Number.isFinite(sourceId) || sourceId <= 0) return;
    paidBySource.set(sourceId, Number(paidBySource.get(sourceId) || 0) + Math.abs(Number(row.total || 0)));
  });

  return txRows
    .map((row) => ({
      ...row,
      balance: Math.max(Number(row.total || 0) - Number(paidBySource.get(Number(row.id)) || 0), 0)
    }))
    .filter((row) => Number(row.balance || 0) > 0);
}

async function buildStandardReport(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ExportPayload
): Promise<ExportBuildResult> {
  const txRows = await fetchBaseTransactions(supabaseAdmin, payload);

  if (payload.reportId === "sales" || payload.reportId === "expenses") {
    const reportRows = txRows.filter((tx) => (payload.reportId === "sales" ? tx.type === 1 : tx.type === 2));
    const rows = reportRows.map((tx) => ({
      id: tx.id,
      fecha: tx.date,
      tipo: txTypeLabel(tx.type),
      total: sanitizeNumber(tx.total),
      balance: sanitizeNumber(tx.balance)
    }));

    return {
      rows,
      total: rows.reduce((acc, row) => acc + Number(row.total || 0), 0),
      balance: rows.reduce((acc, row) => acc + Number(row.balance || 0), 0)
    };
  }

  const isReceivable = payload.reportId === "receivable";
  const filteredByParty = await fetchOutstandingTransactionsAsOf(supabaseAdmin, payload);

  const partyByKey = new Map<
    string,
    {
      personId: number;
      personName: string;
      details: BaseTxRow[];
      total: number;
      balance: number;
    }
  >();

  filteredByParty.forEach((tx) => {
    const personId = Number(tx.personId || 0);
    const personName = tx.persons?.name || "Sin cliente/proveedor";
    const key = `${personId}-${personName}`;

    const bucket = partyByKey.get(key) || {
      personId,
      personName,
      details: [],
      total: 0,
      balance: 0
    };

    bucket.details.push(tx);
    bucket.total += Number(tx.total || 0);
    bucket.balance += Number(tx.balance || 0);
    partyByKey.set(key, bucket);
  });

  const rows: Record<string, string | number>[] = [];
  const orderedParties = Array.from(partyByKey.values()).sort((a, b) => a.personName.localeCompare(b.personName));
  orderedParties.forEach((bucket) => {
    rows.push({
      cliente_proveedor: bucket.personName,
      id: "",
      fecha: "-",
      tipo: "Subtotal",
      total: sanitizeNumber(bucket.total),
      balance: sanitizeNumber(bucket.balance)
    });

    bucket.details
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      .forEach((tx) => {
        rows.push({
          cliente_proveedor: bucket.personName,
          id: tx.id,
          fecha: tx.date,
          tipo: txTypeLabel(tx.type),
          total: sanitizeNumber(tx.total),
          balance: sanitizeNumber(tx.balance)
        });
      });
  });

  return {
    rows,
    total: rows.reduce((acc, row) => acc + Number(row.total || 0), 0),
    balance: rows.reduce((acc, row) => acc + Number(row.balance || 0), 0)
  };
}

async function buildInternalObligationsReport(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ExportPayload
): Promise<ExportBuildResult> {
  let query = supabaseAdmin
    .from("transactions")
    .select('id, date, name, total, balance, "currencyId"')
    .eq("accountId", payload.accountId)
    .eq("isInternalObligation", true)
    .eq("isActive", true)
    .order("date", { ascending: false });

  if (payload.dateFrom) query = query.gte("date", payload.dateFrom);
  if (payload.dateTo) query = query.lte("date", payload.dateTo);
  if (payload.currencyId != null) query = query.eq("currencyId", payload.currencyId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = ((data ?? []) as InternalObligationRow[]).map((row) => ({
    id: row.id,
    fecha: row.date,
    tipo: row.name || "Obligación interna",
    total: sanitizeNumber(row.total),
    balance: sanitizeNumber(row.balance)
  }));

  return {
    rows,
    total: rows.reduce((acc, row) => acc + Number(row.total || 0), 0),
    balance: rows.reduce((acc, row) => acc + Number(row.balance || 0), 0)
  };
}

async function fetchCashflowConceptTotals(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: Pick<ExportPayload, "accountId" | "dateFrom" | "dateTo" | "currencyId">
) {
  let txQuery = supabaseAdmin
    .from("transactions")
    .select(
      "id, type, total, currencyId, tags, isIncomingPayment, isOutcomingPayment, isAccountReceivable, isAccountPayable, isInternalTransfer, isCashWithdrawal"
    )
    .eq("accountId", payload.accountId)
    .eq("isActive", true);

  if (payload.dateFrom) txQuery = txQuery.gte("date", payload.dateFrom);
  if (payload.dateTo) txQuery = txQuery.lte("date", payload.dateTo);
  if (payload.currencyId != null) txQuery = txQuery.eq("currencyId", payload.currencyId);

  const { data: transactions, error: txError } = await txQuery;
  if (txError) throw txError;

  const validTransactions = ((transactions ?? []) as CashflowTxRow[]).filter((tx) => {
    if (tx.isInternalTransfer && !Boolean(tx.isCashWithdrawal)) return false;
    if (tx.isAccountReceivable || tx.isAccountPayable) return false;
    if (Array.isArray(tx.tags) && tx.tags.includes(INVENTORY_ADJUSTMENT_TAG)) return false;
    const isCashSale = Number(tx.type) === 1 && !Boolean(tx.isAccountReceivable);
    return (
      Number(tx.type) === 2 ||
      Number(tx.type) === 3 ||
      Number(tx.type) === 4 ||
      isCashSale ||
      tx.isIncomingPayment ||
      tx.isOutcomingPayment
    );
  });

  if (validTransactions.length === 0) return [] as CashflowGroupedRow[];

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

  const { data: details, error: detailsError } = await supabaseAdmin
    .from("transactionDetails")
    .select("transactionId, total, conceptId, concepts(id, name, parentConceptId)")
    .in("transactionId", txIds);
  if (detailsError) throw detailsError;

  const detailRows = (details ?? []) as CashflowConceptDetail[];
  const parentConceptIds = Array.from(
    new Set(
      detailRows
        .map((row) => Number(row.concepts?.parentConceptId || 0))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  let groupNameById = new Map<number, string>();
  if (parentConceptIds.length > 0) {
    const { data: groups, error: groupsError } = await supabaseAdmin.from("concepts").select("id, name").in("id", parentConceptIds);
    if (groupsError) throw groupsError;
    groupNameById = new Map((groups ?? []).map((group) => [Number(group.id), group.name || "-"]));
  }

  const grouped = new Map<string, CashflowGroupedRow>();
  for (const detail of detailRows) {
    const txMeta = txMetaById.get(Number(detail.transactionId));
    if (!txMeta) continue;

    const isIncome = txMeta.type === 1 || txMeta.type === 3 || txMeta.isIncomingPayment;
    const section = isIncome ? "Ingresos" : "Gastos";
    const conceptName = detail.concepts?.name || "-";
    const parentId = Number(detail.concepts?.parentConceptId || 0);
    const group = groupNameById.get(parentId) || (isIncome ? "Sin grupo (ingresos)" : "Sin grupo (gastos)");
    const rawAmount = Number(detail.total || 0);
    const amount = isIncome ? Math.abs(rawAmount) : -Math.abs(rawAmount);
    const key = `${section}::${group}::${conceptName}`;

    grouped.set(key, {
      section,
      group,
      concept: conceptName,
      total: Number(grouped.get(key)?.total || 0) + amount
    });
  }

  return Array.from(grouped.values());
}

async function fetchCashflowBankBalances(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: Pick<ExportPayload, "accountId" | "dateTo" | "currencyId">
) {
  const { data: forms, error: formsError } = await supabaseAdmin
    .from("account_payment_forms")
    .select("id, name, provider, kind")
    .eq("accountId", payload.accountId)
    .eq("isActive", true)
    .in("kind", ["bank_account", "cashbox"])
    .order("name", { ascending: true });

  if (formsError) throw formsError;

  let txQuery = supabaseAdmin
    .from("transactions")
    .select(
      'id, type, total, currencyId, "accountPaymentFormId", "paymentMethodId", tags, isActive, isIncomingPayment, isOutcomingPayment, isAccountReceivable, isAccountPayable, isInternalTransfer, isDeposit, isCashWithdrawal, payment_methods(code)'
    )
    .eq("accountId", payload.accountId)
    .eq("isActive", true)
    .or("accountPaymentFormId.not.is.null,paymentMethodId.not.is.null");

  if (payload.dateTo) txQuery = txQuery.lte("date", payload.dateTo);
  if (payload.currencyId != null) txQuery = txQuery.eq("currencyId", payload.currencyId);

  const { data: transactions, error: txError } = await txQuery;
  if (txError) throw txError;

  const normalizeSignedTotal = (tx: {
    total: number | null;
    isIncomingPayment: boolean | null;
    isOutcomingPayment: boolean | null;
    type: number | string | null;
  }) => {
    const raw = Number(tx.total || 0);
    const abs = Math.abs(raw);
    if (Boolean(tx.isIncomingPayment)) return abs;
    if (Boolean(tx.isOutcomingPayment)) return -abs;

    const type = Number(tx.type || 0);
    if (type === 1 || type === 3) return abs;
    if (type === 2 || type === 4) return -abs;

    return raw;
  };

  const filteredTransactions = (transactions ?? []).filter((tx) => {
    if (Boolean(tx.isInternalTransfer) && !Boolean(tx.isCashWithdrawal) && !Boolean(tx.isDeposit)) return false;
    if (Boolean(tx.isAccountReceivable) || Boolean(tx.isAccountPayable)) return false;
    if (Array.isArray(tx.tags) && tx.tags.includes(INVENTORY_ADJUSTMENT_TAG)) return false;
    if (Array.isArray(tx.tags) && tx.tags.includes(PRIOR_BALANCE_TAG)) return false;
    return true;
  });

  const totalsByFormId = new Map<number, number>();
  let cashTotal = 0;

  filteredTransactions.forEach((tx) => {
    const signedAmount = normalizeSignedTotal(tx);
    const formId = Number(tx.accountPaymentFormId || 0);
    const methodCode = tx.payment_methods?.code;

    if (formId) {
      const current = Number(totalsByFormId.get(formId) || 0);
      totalsByFormId.set(formId, current + signedAmount);
      return;
    }

    if (methodCode === "cash") {
      cashTotal += signedAmount;
    }
  });

  const bankBalanceRows = ((forms ?? []) as { id: number; name: string; provider: string | null; kind: string }[]).map((form) => {
    const balance = sanitizeNumber(totalsByFormId.get(Number(form.id)) || 0);
    return {
      id: Number(form.id),
      name: form.name,
      provider: form.provider || "",
      kind: form.kind,
      balance
    };
  });

  const hasCashbox = bankBalanceRows.some((row) => row.kind === "cashbox");
  if (!hasCashbox && cashTotal !== 0) {
    bankBalanceRows.push({
      id: -1,
      name: "Efectivo",
      provider: "",
      kind: "cashbox",
      balance: sanitizeNumber(cashTotal)
    });
  } else if (cashTotal !== 0) {
    bankBalanceRows.push({
      id: -2,
      name: "Efectivo sin caja",
      provider: "",
      kind: "cashbox",
      balance: sanitizeNumber(cashTotal)
    });
  }

  return bankBalanceRows;
}

type AccountBalanceSummary = {
  receivable: number;
  payable: number;
};

async function fetchReceivablePayableBalanceSummary(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ExportPayload,
  asOfDate: string
): Promise<AccountBalanceSummary> {
  const fetchGroupBalance = async (typeColumn: "isAccountReceivable" | "isAccountPayable") => {
    let baseQuery = supabaseAdmin
      .from("transactions")
      .select("id, total")
      .eq("accountId", payload.accountId)
      .eq("isActive", true)
      .eq(typeColumn, true)
      .lte("date", asOfDate);

    if (payload.currencyId != null) {
      baseQuery = baseQuery.eq("currencyId", payload.currencyId);
    }

    const { data: txRows, error: txError } = await baseQuery;
    if (txError) throw txError;
    const txItems = (txRows ?? []) as { id: number; total: number }[];
    if (txItems.length === 0) return 0;

    const txIds = txItems.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
    let paymentQuery = supabaseAdmin
      .from("transactionDetails")
      .select("transactionPaidId, total, transactions!inner(date, isActive)")
      .in("transactionPaidId", txIds)
      .eq("transactions.isActive", true)
      .lte("transactions.date", asOfDate);

    const { data: paymentRows, error: paymentError } = await paymentQuery;
    if (paymentError) throw paymentError;

    const paidBySource = new Map<number, number>();
    ((paymentRows ?? []) as Array<{ transactionPaidId: number; total: number }>).forEach((row) => {
      const sourceId = Number(row.transactionPaidId || 0);
      if (!Number.isFinite(sourceId) || sourceId <= 0) return;
      paidBySource.set(sourceId, Number(paidBySource.get(sourceId) || 0) + Math.abs(Number(row.total || 0)));
    });

    return txItems.reduce((acc, row) => {
      const total = Math.abs(Number(row.total || 0));
      const paid = Number(paidBySource.get(Number(row.id) || 0) || 0);
      const remaining = Math.max(total - paid, 0);
      return acc + remaining;
    }, 0);
  };

  const receivable = await fetchGroupBalance("isAccountReceivable");
  const payable = await fetchGroupBalance("isAccountPayable");

  return {
    receivable: sanitizeNumber(receivable),
    payable: sanitizeNumber(payable)
  };
}

async function buildCashflowReport(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ExportPayload
): Promise<ExportBuildResult> {
  const rows = await fetchCashflowConceptTotals(supabaseAdmin, {
    accountId: payload.accountId,
    dateFrom: payload.dateFrom || null,
    dateTo: payload.dateTo || null,
    currencyId: payload.currencyId ?? null
  });

  const orderedRows = rows.sort((a, b) => {
    if (a.section !== b.section) return a.section === "Ingresos" ? -1 : 1;
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    return a.concept.localeCompare(b.concept);
  });

  const exportRows = orderedRows.map((row) => ({
    seccion: row.section,
    grupo: row.group,
    concepto: row.concept,
    total: sanitizeNumber(row.total)
  }));

  const periodMovements = exportRows.reduce((acc, row) => acc + Number(row.total || 0), 0);
  const balanceAsOfDate = payload.dateTo || new Date().toISOString().slice(0, 10);
  const outstandingSummary = await fetchReceivablePayableBalanceSummary(supabaseAdmin, payload, balanceAsOfDate);
  const bankBalances = await fetchCashflowBankBalances(supabaseAdmin, {
    accountId: payload.accountId,
    dateTo: balanceAsOfDate,
    currencyId: payload.currencyId ?? null
  });

  const bankBalanceTotal = bankBalances.reduce((acc, row) => acc + Number(row.balance || 0), 0);

  let previousBalance = 0;
  if (payload.dateFrom) {
    const prevRows = await fetchCashflowConceptTotals(supabaseAdmin, {
      accountId: payload.accountId,
      dateFrom: null,
      dateTo: previousDate(payload.dateFrom),
      currencyId: payload.currencyId ?? null
    });
    previousBalance = prevRows.reduce((acc, row) => acc + Number(row.total || 0), 0);
  }

  const newBalance = previousBalance + periodMovements;

  return {
    rows: exportRows,
    total: periodMovements,
    balance: 0,
    extras: [
      ["Saldo anterior", sanitizeNumber(previousBalance)],
      ["Movimientos del período", sanitizeNumber(periodMovements)],
      ["Nuevo saldo", sanitizeNumber(newBalance)],
      [`Saldo cuentas por cobrar (hasta ${balanceAsOfDate})`, sanitizeNumber(outstandingSummary.receivable)],
      [`Saldo cuentas por pagar (hasta ${balanceAsOfDate})`, sanitizeNumber(outstandingSummary.payable)],
      ["Saldo total cuentas bancarias/cajas", sanitizeNumber(bankBalanceTotal)],
      ["Diferencia contra flujo neto", sanitizeNumber(bankBalanceTotal - newBalance)]
    ],
    additionalSheets: [
      {
        name: "Saldos cuentas y cajas",
        rows: bankBalances.map((row) => ({
          cuenta: row.name,
          proveedor: row.provider || "-",
          tipo: row.kind === "cashbox" ? "Caja" : "Banco",
          saldo: sanitizeNumber(row.balance)
        }))
      }
    ]
  };
}

async function buildEmployeeAbsencesReport(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ExportPayload
): Promise<ExportBuildResult> {
  let query = supabaseAdmin
    .from("employee_absences")
    .select('id, "employeeId", "dateFrom", "dateTo", "isActive", employes(name)')
    .eq("accountId", payload.accountId)
    .eq("isActive", true);

  if (payload.dateFrom) query = query.gte("dateTo", payload.dateFrom);
  if (payload.dateTo) query = query.lte("dateFrom", payload.dateTo);

  const { data, error } = await query;
  if (error) throw error;

  const grouped = new Map<string, { employeeId: number; employeeName: string; totalAbsences: number }>();
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

  const rows = Array.from(grouped.values())
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName))
    .map((row) => ({
      empleado: row.employeeName,
      total_ausencias: row.totalAbsences
    }));

  return {
    rows,
    total: rows.reduce((acc, row) => acc + Number(row.total_ausencias || 0), 0),
    balance: 0
  };
}

async function buildSalesByEmployeeReport(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ExportPayload
): Promise<ExportBuildResult> {
  let txQuery = supabaseAdmin
    .from("transactions")
    .select("id")
    .eq("accountId", payload.accountId)
    .eq("isActive", true)
    .eq("type", 1);

  if (payload.dateFrom) txQuery = txQuery.gte("date", payload.dateFrom);
  if (payload.dateTo) txQuery = txQuery.lte("date", payload.dateTo);
  if (payload.currencyId != null) txQuery = txQuery.eq("currencyId", payload.currencyId);

  const { data: salesTx, error: txError } = await txQuery;
  if (txError) throw txError;

  const txIds = ((salesTx ?? []) as SalesByEmployeeTxRow[])
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!txIds.length) {
    return { rows: [], total: 0, balance: 0 };
  }

  const { data: details, error: detailsError } = await supabaseAdmin
    .from("transactionDetails")
    .select("transactionId, quantity, total, sellerId, concepts(name), employes(name)")
    .in("transactionId", txIds);
  if (detailsError) throw detailsError;

  const groupedBySeller = new Map<
    string,
    {
      sellerId: number;
      sellerName: string;
      total: number;
      products: Map<string, { productName: string; quantity: number; total: number }>;
    }
  >();

  ((details ?? []) as SalesByEmployeeDetailRow[]).forEach((row) => {
    const sellerId = Number(row.sellerId || 0);
    const sellerName = row.employes?.name || "Sin vendedor";
    const productName = row.concepts?.name || "-";
    const sellerKey = `${sellerId}-${sellerName}`;

    if (!groupedBySeller.has(sellerKey)) {
      groupedBySeller.set(sellerKey, {
        sellerId,
        sellerName,
        total: 0,
        products: new Map()
      });
    }

    const sellerBucket = groupedBySeller.get(sellerKey)!;
    const amount = Number(row.total || 0);
    const quantity = Number(row.quantity || 0);
    sellerBucket.total += amount;

    const productBucket = sellerBucket.products.get(productName) || {
      productName,
      quantity: 0,
      total: 0
    };
    productBucket.quantity += quantity;
    productBucket.total += amount;
    sellerBucket.products.set(productName, productBucket);
  });

  const rows: Record<string, string | number>[] = [];
  const sellers = Array.from(groupedBySeller.values()).sort((a, b) => a.sellerName.localeCompare(b.sellerName));
  sellers.forEach((seller) => {
    rows.push({
      empleado: seller.sellerName,
      producto: "(Total empleado)",
      cantidad: "",
      total: sanitizeNumber(seller.total)
    });
    Array.from(seller.products.values())
      .sort((a, b) => a.productName.localeCompare(b.productName))
      .forEach((product) => {
        rows.push({
          empleado: seller.sellerName,
          producto: product.productName,
          cantidad: sanitizeNumber(product.quantity),
          total: sanitizeNumber(product.total)
        });
      });
  });

  return {
    rows,
    total: sellers.reduce((acc, seller) => acc + Number(seller.total || 0), 0),
    balance: 0
  };
}

async function buildExpensesByTagPaymentFormReport(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ExportPayload
): Promise<ExportBuildResult> {
  let query = supabaseAdmin
    .from("transactions")
    .select("id, total, tags, account_payment_forms(name)")
    .eq("accountId", payload.accountId)
    .eq("isActive", true)
    .eq("type", 2);

  if (payload.dateFrom) query = query.gte("date", payload.dateFrom);
  if (payload.dateTo) query = query.lte("date", payload.dateTo);
  if (payload.currencyId != null) query = query.eq("currencyId", payload.currencyId);

  const { data, error } = await query;
  if (error) throw error;

  const grouped = new Map<string, { tag: string; paymentForm: string; total: number }>();
  ((data ?? []) as ExpensesByTagAndPaymentFormRow[]).forEach((row) => {
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

  const rows = Array.from(grouped.values())
    .sort((a, b) => (a.tag === b.tag ? a.paymentForm.localeCompare(b.paymentForm) : a.tag.localeCompare(b.tag)))
    .map((row) => ({
      etiqueta: row.tag,
      forma_pago: row.paymentForm,
      total: sanitizeNumber(row.total)
    }));

  return {
    rows,
    total: rows.reduce((acc, row) => acc + Number(row.total || 0), 0),
    balance: 0
  };
}

async function buildEmployeeLoansReport(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ExportPayload
): Promise<ExportBuildResult> {
  let query = supabaseAdmin
    .from("transactions")
    .select('id, date, name, total, payments, balance, employes(name)')
    .eq("accountId", payload.accountId)
    .eq("isEmployeeLoan", true)
    .is("sourceTransactionId", null)
    .eq("isActive", true);

  if (payload.dateFrom) query = query.gte("date", payload.dateFrom);
  if (payload.dateTo) query = query.lte("date", payload.dateTo);
  if (payload.currencyId != null) query = query.eq("currencyId", payload.currencyId);

  const { data, error } = await query.order("date", { ascending: false });
  if (error) throw error;

  const rows = ((data ?? []) as EmployeeLoanReportRow[]).map((row) => ({
    id: row.id,
    fecha: row.date,
    empleado: row.employes?.name || "-",
    descripcion: row.name || "-",
    total: sanitizeNumber(row.total),
    pagos: sanitizeNumber(row.payments),
    saldo: sanitizeNumber(row.balance)
  }));

  return {
    rows,
    total: rows.reduce((acc, row) => acc + Number(row.total || 0), 0),
    balance: rows.reduce((acc, row) => acc + Number(row.saldo || 0), 0)
  };
}

async function buildCashboxesBalanceReport(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ExportPayload
): Promise<ExportBuildResult> {
  const { data: forms, error: formsError } = await supabaseAdmin
    .from("account_payment_forms")
    .select("id, name, provider, reference, kind, isActive")
    .eq("accountId", payload.accountId)
    .eq("isActive", true)
    .eq("kind", "cashbox")
    .order("name", { ascending: true });
  if (formsError) throw formsError;

  const formRows = (forms ?? []) as CashboxBalanceRow[];

  let txQuery = supabaseAdmin
    .from("transactions")
    .select(
      'id, type, total, currencyId, "accountPaymentFormId", "paymentMethodId", isIncomingPayment, isOutcomingPayment, isAccountReceivable, isAccountPayable, isInternalTransfer, isDeposit, isCashWithdrawal, tags, payment_methods(code)'
    )
    .eq("accountId", payload.accountId)
    .eq("isActive", true)
    .or('accountPaymentFormId.not.is.null,paymentMethodId.not.is.null');

  if (payload.dateTo) txQuery = txQuery.lte("date", payload.dateTo);
  if (payload.currencyId != null) txQuery = txQuery.eq("currencyId", payload.currencyId);

  const { data: txRows, error: txError } = await txQuery;
  if (txError) throw txError;

  const normalizeSignedTotal = (tx: {
    total: number;
    type: number;
    isIncomingPayment: boolean;
    isOutcomingPayment: boolean;
  }) => {
    const raw = Number(tx.total || 0);
    const abs = Math.abs(raw);
    if (tx.isIncomingPayment) return abs;
    if (tx.isOutcomingPayment) return -abs;
    const type = Number(tx.type);
    if (type === 1 || type === 3) return abs;
    if (type === 2 || type === 4) return -abs;
    return raw;
  };

  const filteredTransactions = (txRows ?? []).filter((row) => {
    if (Boolean(row.isInternalTransfer) && !Boolean(row.isCashWithdrawal) && !Boolean(row.isDeposit)) return false;
    if (Boolean(row.isAccountReceivable) || Boolean(row.isAccountPayable)) return false;
    if (Array.isArray(row.tags) && row.tags.includes(INVENTORY_ADJUSTMENT_TAG)) return false;
    if (Array.isArray(row.tags) && row.tags.includes(PRIOR_BALANCE_TAG)) return false;
    return true;
  });

  const totalsByFormId = new Map<number, number>();
  filteredTransactions.forEach((row) => {
    const formId = Number(row.accountPaymentFormId || 0);
    if (!formId) return;
    totalsByFormId.set(formId, Number(totalsByFormId.get(formId) || 0) + normalizeSignedTotal(row));
  });

  const rows = formRows.map((row) => ({
    id: row.id,
    caja: row.name || "-",
    entidad: row.provider || "-",
    referencia: row.reference || "-",
    saldo: sanitizeNumber(totalsByFormId.get(Number(row.id)) || 0)
  }));

  const cashTotal = filteredTransactions.reduce((acc, row) => {
    if (row.payment_methods?.code !== "cash") return acc;
    return acc + normalizeSignedTotal(row);
  }, 0);

  if (rows.length === 0 && cashTotal !== 0) {
    rows.push({
      id: "cash-summary",
      caja: "Efectivo",
      entidad: "-",
      referencia: "-",
      saldo: sanitizeNumber(cashTotal)
    });
  } else if (cashTotal !== 0) {
    rows.push({
      id: "cash-unassigned",
      caja: "Efectivo sin caja",
      entidad: "-",
      referencia: "-",
      saldo: sanitizeNumber(cashTotal)
    });
  }

  return {
    rows,
    total: rows.reduce((acc, row) => acc + Number(row.saldo || 0), 0),
    balance: rows.reduce((acc, row) => acc + Number(row.saldo || 0), 0)
  };
}

async function buildPendingDeliveriesReport(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ExportPayload
): Promise<ExportBuildResult> {
  let txQuery = supabaseAdmin
    .from("transactions")
    .select("id, date, total, currencyId, persons(name)")
    .eq("accountId", payload.accountId)
    .eq("isActive", true)
    .eq("type", 1)
    .order("date", { ascending: false });

  if (payload.dateTo) txQuery = txQuery.lte("date", payload.dateTo);
  if (payload.currencyId != null) txQuery = txQuery.eq("currencyId", payload.currencyId);

  const { data: txRows, error: txError } = await txQuery;
  if (txError) throw txError;

  const saleRows = (txRows ?? []) as PendingDeliveryTxRow[];
  const txIds = saleRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  if (!txIds.length) return { rows: [], total: 0, balance: 0 };

  const { data: details, error: detailsError } = await supabaseAdmin
    .from("transactionDetails")
    .select('id, transactionId, quantity, quantityDelivered, historicalQuantityDelivered, concepts(name)')
    .in("transactionId", txIds);
  if (detailsError) throw detailsError;

  const detailIds = ((details ?? []) as PendingDeliveryDetailRow[])
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);
  const deliveredHistoryByDetailId = new Map<number, number>();
  if (detailIds.length > 0) {
    const { data: historyRows, error: historyError } = await supabaseAdmin
      .from("inventory_delivery_history")
      .select('transactionDetailId, quantity')
      .in("transactionDetailId", detailIds);
    if (historyError) throw historyError;
    (historyRows ?? []).forEach((row) => {
      const detailId = Number(row.transactionDetailId || 0);
      if (!detailId) return;
      deliveredHistoryByDetailId.set(
        detailId,
        Number(deliveredHistoryByDetailId.get(detailId) || 0) + Math.max(Number(row.quantity || 0), 0)
      );
    });
  }

  const txById = new Map(saleRows.map((row) => [Number(row.id), row]));
  const rawRows: Array<{
    factura_id: number;
    fecha: string;
    cliente: string;
    producto: string;
    cantidad: number;
    cantidad_entregada: number;
    pendiente_entrega: number;
  }> = [];
  let totalPending = 0;

  ((details ?? []) as PendingDeliveryDetailRow[]).forEach((row) => {
    const tx = txById.get(Number(row.transactionId));
    if (!tx) return;
    const quantity = Math.max(Number(row.quantity || 0), 0);
    const deliveredFromFields =
      Math.max(Number(row.historicalQuantityDelivered || 0), 0) + Math.max(Number(row.quantityDelivered || 0), 0);
    const deliveredFromHistory = deliveredHistoryByDetailId.get(Number(row.id));
    const delivered = Math.min(
      Math.max(Number.isFinite(deliveredFromHistory) ? deliveredFromHistory : deliveredFromFields, 0),
      quantity
    );
    const pending = Math.max(quantity - delivered, 0);
    if (pending <= 0) return;
    totalPending += pending;
    rawRows.push({
      factura_id: tx.id,
      fecha: tx.date,
      cliente: tx.persons?.name || "-",
      producto: row.concepts?.name || "-",
      cantidad: sanitizeNumber(quantity),
      cantidad_entregada: sanitizeNumber(delivered),
      pendiente_entrega: sanitizeNumber(pending)
    });
  });

  rawRows.sort((a, b) => {
    if (String(a.cliente || "") !== String(b.cliente || "")) {
      return String(a.cliente || "").localeCompare(String(b.cliente || ""));
    }
    if (String(a.producto || "") !== String(b.producto || "")) {
      return String(a.producto || "").localeCompare(String(b.producto || ""));
    }
    const txA = Number(a.factura_id || 0);
    const txB = Number(b.factura_id || 0);
    if (txA !== txB) return txB - txA;
    return String(b.fecha || "").localeCompare(String(a.fecha || ""));
  });

  const rows: Record<string, string | number>[] = [];
  const byClient = new Map<string, typeof rawRows>();
  rawRows.forEach((row) => {
    const key = row.cliente || "-";
    const bucket = byClient.get(key) || [];
    bucket.push(row);
    byClient.set(key, bucket);
  });

  Array.from(byClient.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([clientName, clientRows]) => {
      const clientPending = clientRows.reduce((acc, row) => acc + Number(row.pendiente_entrega || 0), 0);
      rows.push({
        factura_id: "",
        fecha: "",
        cliente: clientName,
        producto: "Subtotal por cliente",
        cantidad: "",
        cantidad_entregada: "",
        pendiente_entrega: sanitizeNumber(clientPending)
      });

      const byProduct = new Map<string, typeof rawRows>();
      clientRows.forEach((row) => {
        const productKey = row.producto || "-";
        const productBucket = byProduct.get(productKey) || [];
        productBucket.push(row);
        byProduct.set(productKey, productBucket);
      });

      Array.from(byProduct.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([productName, productRows]) => {
          const productPending = productRows.reduce((acc, row) => acc + Number(row.pendiente_entrega || 0), 0);
          rows.push({
            factura_id: "",
            fecha: "",
            cliente: "",
            producto: `${productName} - Subtotal por producto`,
            cantidad: "",
            cantidad_entregada: "",
            pendiente_entrega: sanitizeNumber(productPending)
          });
          productRows.forEach((row) => rows.push(row));
        });
    });

  return {
    rows,
    total: sanitizeNumber(totalPending),
    balance: 0
  };
}

async function buildEmployeePayrollReport(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ExportPayload
): Promise<ExportBuildResult> {
  const { data: employeeRows, error: employeeError } = await supabaseAdmin
    .from("employes")
    .select("id, name, salary, isActive")
    .eq("accountId", payload.accountId)
    .eq("isActive", true)
    .order("name", { ascending: true });
  if (employeeError) throw employeeError;

  let txQuery = supabaseAdmin
    .from("transactions")
    .select('id, date, type, total, name, "employeeId", currencyId, employes(name)')
    .eq("accountId", payload.accountId)
    .eq("isActive", true)
    .eq("affectsPayroll", true)
    .not("employeeId", "is", null);

  if (payload.dateFrom) txQuery = txQuery.gte("date", payload.dateFrom);
  if (payload.dateTo) txQuery = txQuery.lte("date", payload.dateTo);
  if (payload.currencyId != null) txQuery = txQuery.eq("currencyId", payload.currencyId);

  const { data: txRows, error: txError } = await txQuery.order("date", { ascending: true }).order("id", { ascending: true });
  if (txError) throw txError;

  const grouped = new Map<number, {
    employeeName: string;
    salary: number;
    adjustments: number;
    totalPayroll: number;
    details: Array<{ id: number; date: string; type: number; name: string; total: number }>;
  }>();

  (employeeRows ?? []).forEach((row) => {
    grouped.set(Number(row.id), {
      employeeName: row.name || "-",
      salary: sanitizeNumber(row.salary),
      adjustments: 0,
      totalPayroll: sanitizeNumber(row.salary),
      details: []
    });
  });

  (txRows ?? []).forEach((row) => {
    const employeeId = Number(row.employeeId || 0);
    if (!employeeId) return;
    const type = Number(row.type);
    if (type !== 2 && type !== 3) return;
    const signedAmount = type === 3 ? Math.abs(Number(row.total || 0)) : -Math.abs(Number(row.total || 0));
    const current = grouped.get(employeeId) || {
      employeeName: row.employes?.name || "-",
      salary: 0,
      adjustments: 0,
      totalPayroll: 0,
      details: []
    };
    current.details.push({
      id: Number(row.id),
      date: row.date,
      type: Number(row.type),
      name: row.name || "-",
      total: sanitizeNumber(signedAmount)
    });
    current.adjustments = sanitizeNumber(current.adjustments + signedAmount);
    current.totalPayroll = sanitizeNumber(current.salary + current.adjustments);
    grouped.set(employeeId, current);
  });

  const rows: Record<string, string | number>[] = [];
  Array.from(grouped.values())
    .filter((row) => row.salary !== 0 || row.details.length > 0)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName))
    .forEach((row) => {
      rows.push({
        empleado: row.employeeName,
        detalle: "Subtotal",
        tipo: "-",
        fecha: "-",
        salario: sanitizeNumber(row.salary),
        ajuste_periodo: sanitizeNumber(row.adjustments),
        total_planilla: sanitizeNumber(row.totalPayroll)
      });

      row.details.forEach((detail) => {
        rows.push({
          empleado: row.employeeName,
          detalle: detail.name,
          tipo: detail.type === 3 ? "Ingreso" : "Gasto",
          fecha: detail.date,
          salario: "",
          ajuste_periodo: sanitizeNumber(detail.total),
          total_planilla: ""
        });
      });
    });

  return {
    rows,
    total: sanitizeNumber(rows.reduce((acc, row) => acc + Number(row.total_planilla || 0), 0)),
    balance: 0
  };
}

async function buildReportData(supabaseAdmin: ReturnType<typeof createClient>, payload: ExportPayload): Promise<ExportBuildResult> {
  if (payload.reportId === "internal_obligations") {
    return buildInternalObligationsReport(supabaseAdmin, payload);
  }
  if (payload.reportId === "cashflow") {
    return buildCashflowReport(supabaseAdmin, payload);
  }
  if (payload.reportId === "employee_absences") {
    return buildEmployeeAbsencesReport(supabaseAdmin, payload);
  }
  if (payload.reportId === "sales_by_employee") {
    return buildSalesByEmployeeReport(supabaseAdmin, payload);
  }
  if (payload.reportId === "expenses_by_tag_payment_form") {
    return buildExpensesByTagPaymentFormReport(supabaseAdmin, payload);
  }
  if (payload.reportId === "employee_loans") {
    return buildEmployeeLoansReport(supabaseAdmin, payload);
  }
  if (payload.reportId === "employee_payroll") {
    return buildEmployeePayrollReport(supabaseAdmin, payload);
  }
  if (payload.reportId === "cashboxes_balance") {
    return buildCashboxesBalanceReport(supabaseAdmin, payload);
  }
  if (payload.reportId === "pending_deliveries") {
    return buildPendingDeliveriesReport(supabaseAdmin, payload);
  }
  return buildStandardReport(supabaseAdmin, payload);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 405
      });
    }

    const payload = (await req.json()) as ExportPayload;
    if (!payload?.accountId || !payload?.reportId) {
      return new Response(JSON.stringify({ success: false, error: "Missing accountId/reportId" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 400
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing SUPABASE_URL or SERVICE_ROLE_KEY in function secrets."
        }),
        {
          headers: { ...corsHeaders, "content-type": "application/json" },
          status: 500
        }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    await authenticateRequest(supabaseAdmin, req, payload.accountId);

    const report = await buildReportData(supabaseAdmin, payload);

    const metadataRows: Array<[string, string | number]> = [
      ["Reporte", reportTitles[payload.reportId]],
      ["Cuenta", payload.accountId],
      ["Generado en", new Date().toISOString()],
      ["Desde", normalizeDate(payload.dateFrom)],
      ["Hasta", normalizeDate(payload.dateTo)],
      ["Moneda ID", payload.currencyId ?? "Todas"],
      ["Registros", report.rows.length],
      ["Total", sanitizeNumber(report.total)],
      ["Balance", sanitizeNumber(report.balance)]
    ];

    if (report.extras?.length) {
      metadataRows.push(...report.extras);
    }

    const metadataSheet = XLSX.utils.aoa_to_sheet(metadataRows);
    const detailSheet = XLSX.utils.json_to_sheet(report.rows);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, metadataSheet, "Resumen");
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Detalle");

    if (report.additionalSheets?.length) {
      report.additionalSheets.forEach((sheet) => {
        const safeName = (sheet.name || "Hoja adicional").slice(0, 31) || "Hoja adicional";
        const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, safeName);
      });
    }

    const fileBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

    const now = new Date();
    const dateFolder = now.toISOString().slice(0, 10);
    const filePath = `${payload.accountId}/${dateFolder}/${payload.reportId}-${now.getTime()}.xlsx`;

    const { error: uploadError } = await supabaseAdmin.storage.from("report-exports").upload(filePath, fileBuffer, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false
    });
    if (uploadError) throw uploadError;

    const { data: signed, error: signedError } = await supabaseAdmin.storage.from("report-exports").createSignedUrl(filePath, 600);
    if (signedError || !signed?.signedUrl) {
      throw signedError ?? new Error("Could not create signed URL");
    }

    return new Response(
      JSON.stringify({
        success: true,
        path: filePath,
        downloadUrl: signed.signedUrl
      }),
      {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 200
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
      status: message.includes("Forbidden") ? 403 : message.includes("Invalid token") || message.includes("Missing bearer token") ? 401 : 400
    });
  }
});
