import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

interface ExportPayload {
  accountId: number;
  reportId: "sales" | "receivable" | "payable" | "internal_obligations" | "expenses" | "cashflow";
  dateFrom?: string | null;
  dateTo?: string | null;
  currencyId?: number | null;
}

type TxRow = {
  id: number;
  date: string;
  type: number;
  total: number;
  balance: number;
  isAccountPayable: boolean;
  isAccountReceivable: boolean;
  currencyId: number | null;
};

type InternalPayableRow = {
  id: number;
  date: string;
  name: string;
  total: number;
  balance: number;
  currencyId: number | null;
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

function buildReportRows(transactions: TxRow[], reportId: ExportPayload["reportId"]) {
  if (reportId === "internal_obligations") return [];
  if (reportId === "cashflow") return [];
  if (reportId === "sales") return transactions.filter((tx) => tx.type === 1);
  if (reportId === "expenses") return transactions.filter((tx) => tx.type === 2);
  if (reportId === "receivable") return transactions.filter((tx) => tx.isAccountReceivable && Number(tx.balance || 0) > 0);
  if (reportId === "payable") return transactions.filter((tx) => tx.isAccountPayable && Number(tx.balance || 0) > 0);

  const incomes = transactions.filter((tx) => tx.type === 1 || tx.type === 3);
  const out = transactions.filter((tx) => tx.type === 2);
  return [...incomes, ...out];
}

function txTypeLabel(type: number) {
  if (type === 1) return "Venta";
  if (type === 2) return "Gasto";
  return "Ingreso";
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

    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: "Missing bearer token" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 401
      });
    }

    const {
      data: { user },
      error: userError
    } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: `Invalid token: ${userError?.message ?? "unknown"}` }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 401
      });
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("usersToAccounts")
      .select('"userId","accountId"')
      .eq("userId", user.id)
      .eq("accountId", payload.accountId)
      .maybeSingle();

    if (membershipError || !membership) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden for this account" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 403
      });
    }

    const exportRows: Array<{ id: number; date: string; typeLabel: string; total: number; balance: number }> = [];
    let totalAmount = 0;
    let totalBalance = 0;

    if (payload.reportId === "internal_obligations") {
      let internalQuery = supabaseAdmin
        .from("transactions")
        .select('id, date, name, total, balance, "currencyId"')
        .eq("accountId", payload.accountId)
        .eq("isInternalObligation", true)
        .eq("isActive", true)
        .order("date", { ascending: false });

      if (payload.dateFrom) internalQuery = internalQuery.gte("date", payload.dateFrom);
      if (payload.dateTo) internalQuery = internalQuery.lte("date", payload.dateTo);
      if (payload.currencyId != null) internalQuery = internalQuery.eq("currencyId", payload.currencyId);

      const { data: internalRows, error: internalError } = await internalQuery;
      if (internalError) throw internalError;

      const rows = (internalRows ?? []) as InternalPayableRow[];
      totalAmount = rows.reduce((acc, row) => acc + Number(row.total || 0), 0);
      totalBalance = rows.reduce((acc, row) => acc + Number(row.balance || 0), 0);
      exportRows.push(
        ...rows.map((row) => ({
          id: row.id,
          date: row.date,
          typeLabel: row.name || "Obligación interna",
          total: Number(Number(row.total || 0).toFixed(2)),
          balance: Number(Number(row.balance || 0).toFixed(2))
        }))
      );
    } else if (payload.reportId === "cashflow") {
      let txQuery = supabaseAdmin
        .from("transactions")
        .select('id, date, type, total, isIncomingPayment, isOutcomingPayment, "accountPaymentFormId", "currencyId"')
        .eq("accountId", payload.accountId)
        .eq("isActive", true)
        .order("date", { ascending: false });

      if (payload.dateFrom) txQuery = txQuery.gte("date", payload.dateFrom);
      if (payload.dateTo) txQuery = txQuery.lte("date", payload.dateTo);
      if (payload.currencyId != null) txQuery = txQuery.eq("currencyId", payload.currencyId);

      const { data: cashRows, error: cashError } = await txQuery;
      if (cashError) throw cashError;

      const formIds = Array.from(new Set((cashRows ?? []).map((row) => row.accountPaymentFormId).filter(Boolean)));
      const { data: forms } = formIds.length
        ? await supabaseAdmin.from("account_payment_forms").select("id, name").in("id", formIds)
        : { data: [] };
      const formMap = new Map((forms ?? []).map((f) => [f.id, f.name]));

      const grouped = new Map<number, { total: number; balance: number; label: string }>();
      for (const row of cashRows ?? []) {
        if (!row.accountPaymentFormId) continue;
        if (!(row.isIncomingPayment || row.isOutcomingPayment || row.type === 2)) continue;
        const signedAmount = row.isIncomingPayment ? Math.abs(Number(row.total || 0)) : -Math.abs(Number(row.total || 0));
        const current = grouped.get(row.accountPaymentFormId) ?? {
          total: 0,
          balance: 0,
          label: formMap.get(row.accountPaymentFormId) ?? `#${row.accountPaymentFormId}`
        };
        current.total += signedAmount;
        grouped.set(row.accountPaymentFormId, current);
      }

      const rows = Array.from(grouped.entries()).map(([id, values]) => ({
        id,
        date: "",
        typeLabel: values.label,
        total: Number(values.total.toFixed(2)),
        balance: 0
      }));
      totalAmount = rows.reduce((acc, row) => acc + Number(row.total || 0), 0);
      totalBalance = 0;
      exportRows.push(...rows);
    } else {
      let txQuery = supabaseAdmin
        .from("transactions")
        .select("id, date, type, total, balance, isAccountPayable, isAccountReceivable, currencyId")
        .eq("accountId", payload.accountId)
        .eq("isActive", true)
        .order("date", { ascending: false });

      if (payload.dateFrom) txQuery = txQuery.gte("date", payload.dateFrom);
      if (payload.dateTo) txQuery = txQuery.lte("date", payload.dateTo);

      const { data: transactions, error: txError } = await txQuery;
      if (txError) {
        throw txError;
      }

      const txRows = (transactions ?? []) as TxRow[];
      const filteredByCurrency =
        payload.currencyId != null ? txRows.filter((tx) => Number(tx.currencyId ?? 0) === Number(payload.currencyId)) : txRows;
      const reportRows = buildReportRows(filteredByCurrency, payload.reportId);
      totalAmount = reportRows.reduce((acc, row) => acc + Number(row.total || 0), 0);
      totalBalance = reportRows.reduce((acc, row) => acc + Number(row.balance || 0), 0);
      exportRows.push(
        ...reportRows.map((tx) => ({
          id: tx.id,
          date: tx.date,
          typeLabel: txTypeLabel(tx.type),
          total: Number(Number(tx.total || 0).toFixed(2)),
          balance: Number(Number(tx.balance || 0).toFixed(2))
        }))
      );
    }

    const metadataSheet = XLSX.utils.aoa_to_sheet([
      ["Reporte", reportTitles[payload.reportId]],
      ["Cuenta", payload.accountId],
      ["Generado en", new Date().toISOString()],
      ["Desde", payload.dateFrom ?? "-"],
      ["Hasta", payload.dateTo ?? "-"],
      ["Moneda ID", payload.currencyId ?? "Todas"],
      ["Registros", exportRows.length],
      ["Total", Number(totalAmount.toFixed(2))],
      ["Balance", Number(totalBalance.toFixed(2))]
    ]);

    const detailSheet = XLSX.utils.json_to_sheet(
      exportRows.map((row) => ({
        id: row.id,
        fecha: row.date,
        tipo: row.typeLabel,
        total: row.total,
        balance: row.balance
      }))
    );

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

    if (uploadError) {
      throw uploadError;
    }

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
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
      status: 400
    });
  }
});
