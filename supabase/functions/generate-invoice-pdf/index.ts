import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAllPages } from "../_shared/fetchAllPages.js";
import { buildInvoicePdfRecord } from "../_shared/invoicePdfPayload.js";
import { authorizePrinting, corsHeaders, imprentJson, imprentRequest, json, PrintError, printErrorResponse, requireIntegration } from "../_shared/imprent.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    const accountId = Number(body.accountId), transactionId = Number(body.transactionId);
    if (!Number.isSafeInteger(transactionId) || transactionId <= 0) throw new PrintError("Factura invalida.");
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const { account } = await authorizePrinting(client, req, accountId);
    const config = await requireIntegration(client, accountId);
    let query = client.from("invoice_pdf_templates").select('id, "providerTemplateId"')
      .eq("accountId", accountId).eq("isActive", true);
    if (body.templateId != null) {
      if (!Number.isSafeInteger(Number(body.templateId)) || Number(body.templateId) <= 0) throw new PrintError("Plantilla invalida.");
      query = query.eq("id", Number(body.templateId));
    } else query = query.eq("isDefault", true);
    const { data: template, error: templateError } = await query.single();
    if (templateError || !template) throw new PrintError("Configura una plantilla de factura activa en Integraciones.", 412);
    const { data: tx, error } = await client.from("transactions")
      .select('id, "personId", "currencyId", date, type, name, total, payments, balance, tags, "isActive", "isAccountReceivable", "number", "printNumber", "referenceNumber", "correlativeSnapshot"')
      .eq("accountId", accountId).eq("id", transactionId).eq("type", 1).single();
    if (error || !tx || tx.tags?.includes("__manual_receivable__")) throw new PrintError("Factura no encontrada.", 404);
    // An annulled document must never appear to be a valid invoice in a custom template.
    if (!tx.isActive) throw new PrintError("No se puede generar PDF de una factura anulada.", 409);
    const personResult = tx.personId ? await client.from("persons").select("id, name, address, phone, rtn")
      .eq("accountId", accountId).eq("id", tx.personId).single() : { data: null, error: null };
    const currencyResult = tx.currencyId ? await client.from("currencies").select("id, name, symbol")
      .eq("accountId", accountId).eq("id", tx.currencyId).single() : { data: null, error: null };
    if (personResult.error || currencyResult.error) throw new PrintError("No se pudieron cargar cliente o moneda.");
    const details = await fetchAllPages((from: number, to: number) => client.from("transactionDetails")
      .select('id, "conceptId", quantity, price, net, tax, "taxPercentage", discount, "discountPercentage", "additionalCharges", total, concepts(name)')
      .eq("transactionId", transactionId).order("id").range(from, to));
    const record = buildInvoicePdfRecord({ account, transaction: tx, person: personResult.data, currency: currencyResult.data, details });
    const generated = await imprentJson("doc-generator", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: template.providerTemplateId, copies: 1, includeImages: false, records: [record] }),
    }, config.credentials.apiKey);
    const file = generated.finalFile || generated.file;
    if (typeof file !== "string" || !file) throw new PrintError("Imprent no devolvio el archivo PDF.", 502);
    const response = await imprentRequest(`doc-generator/files/${encodeURIComponent(file)}/content`, {}, config.credentials.apiKey);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new PrintError("El archivo recibido no es un PDF.", 502);
    return new Response(bytes, { headers: { ...corsHeaders, "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="factura-${transactionId}.pdf"` } });
  } catch (error) { return printErrorResponse(error); }
});
