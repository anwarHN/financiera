import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

interface ExportPayload {
  accountId: number;
  reportId: "sales" | "receivable" | "payable" | "internal_obligations" | "expenses" | "cashflow";
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
  isIncomingPayment: boolean;
  isOutcomingPayment: boolean;
  isAccountReceivable: boolean;
  isInternalTransfer: boolean;
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

type ExportBuildResult = {
  rows: Record<string, string | number>[];
  total: number;
  balance: number;
  extras?: Array<[string, string | number]>;
};

const reportTitles: Record<ExportPayload["reportId"], string> = {
  sales: "Ventas",
  receivable: "Cuentas por cobrar",
  payable: "Cuentas por pagar",
  internal_obligations: "Obligaciones internas",
  expenses: "Gastos",
  cashflow: "Flujo de caja"
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
    .select("id, date, type, total, balance, isAccountPayable, isAccountReceivable, currencyId")
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

async function buildStandardReport(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ExportPayload
): Promise<ExportBuildResult> {
  const txRows = await fetchBaseTransactions(supabaseAdmin, payload);

  let reportRows: BaseTxRow[] = [];
  if (payload.reportId === "sales") reportRows = txRows.filter((tx) => tx.type === 1);
  if (payload.reportId === "expenses") reportRows = txRows.filter((tx) => tx.type === 2);
  if (payload.reportId === "receivable") reportRows = txRows.filter((tx) => tx.isAccountReceivable && Number(tx.balance || 0) > 0);
  if (payload.reportId === "payable") reportRows = txRows.filter((tx) => tx.isAccountPayable && Number(tx.balance || 0) > 0);

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
    .select("id, type, total, currencyId, isIncomingPayment, isOutcomingPayment, isAccountReceivable, isInternalTransfer")
    .eq("accountId", payload.accountId)
    .eq("isActive", true);

  if (payload.dateFrom) txQuery = txQuery.gte("date", payload.dateFrom);
  if (payload.dateTo) txQuery = txQuery.lte("date", payload.dateTo);
  if (payload.currencyId != null) txQuery = txQuery.eq("currencyId", payload.currencyId);

  const { data: transactions, error: txError } = await txQuery;
  if (txError) throw txError;

  const validTransactions = ((transactions ?? []) as CashflowTxRow[]).filter((tx) => {
    if (tx.isInternalTransfer) return false;
    const isCashSale = Number(tx.type) === 1 && !Boolean(tx.isAccountReceivable);
    return Number(tx.type) === 2 || Number(tx.type) === 3 || isCashSale || tx.isIncomingPayment || tx.isOutcomingPayment;
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
    const amount = Number(detail.total || 0);
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
      ["Nuevo saldo", sanitizeNumber(newBalance)]
    ]
  };
}

async function buildReportData(supabaseAdmin: ReturnType<typeof createClient>, payload: ExportPayload): Promise<ExportBuildResult> {
  if (payload.reportId === "internal_obligations") {
    return buildInternalObligationsReport(supabaseAdmin, payload);
  }
  if (payload.reportId === "cashflow") {
    return buildCashflowReport(supabaseAdmin, payload);
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
