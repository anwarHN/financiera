import { supabase } from "../lib/supabase";

export async function callImprent(body, functionName = "imprent-integration") {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    const payload = await error.context?.json?.().catch(() => null);
    throw new Error(payload?.error || error.message || "No se pudo conectar con Imprent.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function generateInvoicePdf({ accountId, transactionId, templateId }) {
  const data = await callImprent({ accountId, transactionId, templateId }, "generate-invoice-pdf");
  if (!(data instanceof Blob)) throw new Error("No se recibio un PDF valido.");
  return new Blob([data], { type: "application/pdf" });
}
