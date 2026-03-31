import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface Payload {
  accountId: number;
  transactionId: number;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function padLine(left: string, right = "", width = 40) {
  const cleanLeft = normalizeText(left);
  const cleanRight = normalizeText(right);
  if (!cleanRight) return cleanLeft.slice(0, width);
  const available = Math.max(width - cleanRight.length - 1, 0);
  const slicedLeft = cleanLeft.slice(0, available);
  return `${slicedLeft}${" ".repeat(Math.max(width - slicedLeft.length - cleanRight.length, 1))}${cleanRight}`.slice(0, width);
}

function centerLine(value: string, width = 40) {
  const clean = normalizeText(value).slice(0, width);
  const left = Math.max(Math.floor((width - clean.length) / 2), 0);
  return `${" ".repeat(left)}${clean}`.slice(0, width);
}

function divider(width = 40) {
  return "-".repeat(width);
}

function wrapText(value: string, width = 40) {
  const clean = normalizeText(value).trim();
  if (!clean) return [""];

  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word.length > width ? word.slice(0, width) : word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function formatMoney(value: unknown, symbol = "") {
  const amount = Number(value || 0);
  return `${symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-HN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

function buildInvoiceTxt(args: {
  account: { name?: string | null; address?: string | null; phone?: string | null; email?: string | null };
  transaction: {
    id: number;
    date?: string | null;
    name?: string | null;
    total?: number | null;
    net?: number | null;
    taxes?: number | null;
    discounts?: number | null;
    additionalCharges?: number | null;
    isActive?: boolean | null;
    isAccountReceivable?: boolean | null;
    printNumber?: string | null;
    number?: number | null;
  };
  person: { name?: string | null; address?: string | null } | null;
  currency: { name?: string | null; symbol?: string | null } | null;
  details: Array<{
    quantity?: number | null;
    total?: number | null;
    discount?: number | null;
    concepts?: { name?: string | null } | null;
  }>;
}) {
  const { account, transaction, person, currency, details } = args;
  const width = 40;
  const currencySymbol = currency?.symbol || "";
  const documentNumber = transaction.printNumber || transaction.number || transaction.id;
  const paymentType = transaction.isAccountReceivable ? "Credito" : "Contado";

  const lines = [
    centerLine(account.name || "Factura", width),
    ...wrapText(account.address || "", width).map((line) => centerLine(line, width)),
    account.phone ? centerLine(`Telefonos: ${account.phone}`, width) : "",
    account.email ? centerLine(`Correo: ${account.email}`, width) : "",
    "",
    `Factura: ${documentNumber}`,
    `Cliente: ${normalizeText(person?.name || "-")}`,
    `Dir. Cliente: ${normalizeText(person?.address || "")}`,
    `Moneda: ${normalizeText(currency?.name || "-")}`,
    `Tipo de compra: ${paymentType}`,
    `Fecha: ${formatDateTime(transaction.date)}`,
    `Estado: ${transaction.isActive === false ? "Anulada" : "Valida"}`,
    divider(width),
    padLine("Producto o Servicio", "Total", width),
    divider(width)
  ];

  details.forEach((detail) => {
    const conceptName = detail.concepts?.name || "-";
    const quantity = Number(detail.quantity || 0).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
    const total = formatMoney(detail.total || 0, currencySymbol);
    lines.push(padLine(`${quantity} x`, total, width));
    wrapText(conceptName, width).forEach((line) => lines.push(line));
    if (Number(detail.discount || 0) > 0) {
      lines.push(padLine("Descuento", formatMoney(detail.discount || 0, currencySymbol), width));
    }
  });

  lines.push(divider(width));
  lines.push(padLine("Importe gravado", formatMoney(transaction.net || 0, currencySymbol), width));
  lines.push(padLine("I.S.V.", formatMoney(transaction.taxes || 0, currencySymbol), width));
  if (Number(transaction.discounts || 0) > 0) {
    lines.push(padLine("Descuentos", formatMoney(transaction.discounts || 0, currencySymbol), width));
  }
  if (Number(transaction.additionalCharges || 0) > 0) {
    lines.push(padLine("Cargos adicionales", formatMoney(transaction.additionalCharges || 0, currencySymbol), width));
  }
  lines.push(padLine("Total", formatMoney(transaction.total || 0, currencySymbol), width));
  lines.push("");
  if (transaction.name) {
    lines.push("Observaciones:");
    wrapText(transaction.name, width).forEach((line) => lines.push(line));
    lines.push("");
  }
  lines.push(centerLine("Gracias por su visita", width));
  lines.push("");
  lines.push("");
  lines.push("\u001dV1");

  return `${lines.join("\n")}\n`;
}

async function authenticateRequest(supabaseAdmin: ReturnType<typeof createClient>, req: Request, accountId: number) {
  const authHeader = req.headers.get("Authorization") || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) throw new Error("Missing bearer token");

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

    const payload = (await req.json()) as Payload;
    if (!payload?.accountId || !payload?.transactionId) {
      return new Response(JSON.stringify({ success: false, error: "Missing accountId/transactionId" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 400
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ success: false, error: "Missing function secrets." }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 500
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    await authenticateRequest(supabaseAdmin, req, Number(payload.accountId));

    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from("transactions")
      .select(
        'id, accountId, personId, date, type, name, total, net, taxes, discounts, additionalCharges, isActive, isAccountReceivable, "number", "printNumber", currencyId'
      )
      .eq("id", payload.transactionId)
      .eq("accountId", payload.accountId)
      .eq("type", 1)
      .single();
    if (transactionError || !transaction) throw transactionError ?? new Error("Invoice not found");

    const [accountResult, personResult, currencyResult, detailsResult] = await Promise.all([
      supabaseAdmin.from("accounts").select("id, name, address, phone, email").eq("id", payload.accountId).single(),
      transaction.personId
        ? supabaseAdmin.from("persons").select("id, name, address").eq("id", transaction.personId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      transaction.currencyId
        ? supabaseAdmin.from("currencies").select("id, name, symbol").eq("id", transaction.currencyId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from("transactionDetails")
        .select("id, quantity, total, discount, concepts(name)")
        .eq("transactionId", payload.transactionId)
        .order("id", { ascending: true })
    ]);

    if (accountResult.error || !accountResult.data) throw accountResult.error ?? new Error("Account not found");
    if (personResult.error) throw personResult.error;
    if (currencyResult.error) throw currencyResult.error;
    if (detailsResult.error) throw detailsResult.error;

    const txtContent = buildInvoiceTxt({
      account: accountResult.data,
      transaction,
      person: personResult.data,
      currency: currencyResult.data,
      details: detailsResult.data ?? []
    });

    const fileNumber = normalizeText(String(transaction.printNumber || transaction.number || transaction.id)).replace(/[^A-Za-z0-9_-]+/g, "_");
    const fileName = `factura-${fileNumber || transaction.id}.txt`;
    const filePath = `${payload.accountId}/invoice-print/${Date.now()}-${fileName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("report-exports")
      .upload(filePath, new TextEncoder().encode(txtContent), {
        contentType: "text/plain; charset=utf-8",
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
        fileName,
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
