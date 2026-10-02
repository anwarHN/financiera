import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAllPages } from "../_shared/fetchAllPages.js";
import { authorizePrinting, corsHeaders, getIntegration, imprentJson, imprentRequest, json, PrintError, printErrorResponse, requireIntegration } from "../_shared/imprent.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const multipart = req.headers.get("content-type")?.includes("multipart/form-data");
    const form = multipart ? await req.formData() : null;
    const body = form ? Object.fromEntries(form) : await req.json();
    const accountId = Number(body.accountId);
    const action = String(body.action || "status");
    const { user, account } = await authorizePrinting(client, req, accountId, action !== "print-options");
    if (action === "status" || action === "print-options") {
      const config = await getIntegration(client, accountId);
      const templates = await fetchAllPages((from: number, to: number) => client.from("invoice_pdf_templates")
        .select('id, name, "fileName", "isDefault", "isActive"').eq("accountId", accountId).eq("isActive", true)
        .order("isDefault", { ascending: false }).order("id").range(from, to));
      return json({ isActive: Boolean(config?.isActive), templates,
        ...(action === "status" ? { settings: config?.settings || {}, lastError: config?.lastError || null, configured: Boolean(config?.credentials?.apiKey) } : {}) });
    }
    if (action === "activate") {
      const adminKey = Deno.env.get("IMPRENT_INTERNAL_ADMIN_KEY");
      if (!adminKey) throw new PrintError("Falta IMPRENT_INTERNAL_ADMIN_KEY en el servidor.", 412);
      const lease = crypto.randomUUID();
      const { data: claimed, error: claimError } = await client.rpc("claim_imprent_setup", { p_account_id: accountId, p_lease: lease });
      if (claimError || !claimed) throw new PrintError("Hay una activacion en curso. Intenta nuevamente en unos minutos.", 409);
      const save = async (values: Record<string, unknown>) => {
        const { error } = await client.from("account_integrations").update({ ...values, updatedAt: new Date().toISOString() })
          .eq("accountId", accountId).eq("provider", "imprent").eq("leaseId", lease);
        if (error) throw new PrintError("No se pudo guardar el estado de Imprent.", 500);
      };
      try {
        let config = await getIntegration(client, accountId);
        if (!config?.credentials?.apiKey) {
          const email = String(user.email || "").trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PrintError("Correo de registro invalido.");
          const { data: linked, error: linkedError } = await client.from("account_integrations").select('"accountId"')
            .eq("provider", "imprent").eq("settings->>email", email).neq("accountId", accountId).limit(1);
          if (linkedError) throw linkedError;
          if (linked?.length) throw new PrintError("Este correo ya esta vinculado a Imprent para otra empresa. Se requiere un propietario con correo diferente.", 409);
          await save({ settings: { email } });
          const registration = await imprentJson("public/register-account", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountName: account.name, adminEmail: email, adminName: account.name }),
          });
          const apiKey = registration.bootstrapApiKey || registration.apiKey;
          const remoteId = registration.account?.id || registration.account?.uuid || registration.accountUuid;
          if (!apiKey || !remoteId) throw new PrintError("Imprent no devolvio credenciales completas.", 502);
          // Persist immediately, even if billing fails, to avoid re-registering / rotating the key on retry.
          await save({ credentials: { apiKey, accountId: String(remoteId) },
            settings: { email, defaultInvoiceTemplateId: registration.defaultTemplates?.invoice || null }, isActive: false });
          config = await getIntegration(client, accountId);
        }
        await imprentRequest(`admin/accounts/${encodeURIComponent(config.credentials.accountId)}/billing-profile`, {
          method: "PATCH", headers: { "Content-Type": "application/json", "X-Internal-Admin-Key": adminKey },
          body: JSON.stringify({ billingMode: "B2B_FREE" }),
        });
        if (config.settings?.defaultInvoiceTemplateId) {
          const { error } = await client.rpc("save_invoice_pdf_template", {
            p_account_id: accountId, p_name: "Factura (Imprent)", p_provider_id: config.settings.defaultInvoiceTemplateId,
            p_file_name: "invoiceUnicoERP.docx", p_default: false,
          });
          if (error) throw new PrintError("No se pudo registrar la plantilla por defecto.", 500);
        }
        await save({ isActive: true, lastError: null });
        return json({ success: true });
      } catch (error) {
        await save({ isActive: false, lastError: error instanceof PrintError ? error.message : "Fallo la activacion." });
        throw error;
      } finally {
        await client.from("account_integrations").update({ leaseId: null, leaseUntil: null })
          .eq("accountId", accountId).eq("provider", "imprent").eq("leaseId", lease);
      }
    }
    if (action === "disable") {
      const { error } = await client.from("account_integrations").update({ isActive: false })
        .eq("accountId", accountId).eq("provider", "imprent");
      if (error) throw error;
      return json({ success: true });
    }
    const config = await requireIntegration(client, accountId);
    if (action === "upload") {
      const file = form?.get("template");
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".docx") || file.size === 0 || file.size > 10 * 1024 * 1024) {
        throw new PrintError("Selecciona una plantilla .docx de hasta 10 MB.");
      }
      const upload = new FormData();
      upload.append("template", file, file.name);
      const result = await imprentJson("doc-generator/templates", { method: "POST", body: upload }, config.credentials.apiKey);
      const templateId = result.templateId || result.id || result.template?.id;
      if (!templateId) throw new PrintError("Imprent no devolvio el id de la plantilla.", 502);
      const { error } = await client.rpc("save_invoice_pdf_template", {
        p_account_id: accountId, p_name: String(body.name || file.name).slice(0, 160), p_provider_id: String(templateId),
        p_file_name: file.name, p_default: false,
      });
      if (error) throw new PrintError("La plantilla se subio, pero no pudo vincularse. Revisa la configuracion antes de reintentar.", 500);
      return json({ success: true });
    }
    const templateId = Number(body.templateId);
    if (!Number.isSafeInteger(templateId) || templateId <= 0) throw new PrintError("Plantilla invalida.");
    const { data: template, error } = await client.from("invoice_pdf_templates").select("*")
      .eq("accountId", accountId).eq("id", templateId).eq("isActive", true).single();
    if (error || !template) throw new PrintError("Plantilla no encontrada.", 404);
    if (action === "default") {
      const { error } = await client.rpc("save_invoice_pdf_template", { p_account_id: accountId, p_name: template.name,
        p_provider_id: template.providerTemplateId, p_file_name: template.fileName, p_default: true });
      if (error) throw error;
      return json({ success: true });
    }
    if (action === "deactivate-template") {
      // Require choosing a replacement first; do not silently leave the account without a default.
      const { data, error } = await client.from("invoice_pdf_templates").update({ isActive: false })
        .eq("accountId", accountId).eq("id", templateId).eq("isDefault", false).select("id");
      if (error) throw error;
      if (!data?.length) throw new PrintError("Selecciona otra plantilla por defecto antes de desactivar esta.", 409);
      return json({ success: true });
    }
    if (action === "download-template") {
      const response = await imprentRequest(`doc-generator/templates/${encodeURIComponent(template.providerTemplateId)}/content`, {}, config.credentials.apiKey);
      return new Response(await response.arrayBuffer(), { headers: { ...corsHeaders,
        "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="template-${templateId}.docx"` } });
    }
    throw new PrintError("Accion no soportada.");
  } catch (error) { return printErrorResponse(error); }
});
