export class PrintError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
export const json = (value: unknown, status = 200) => Response.json(value, { status, headers: corsHeaders });

export async function authorizePrinting(client: any, req: Request, accountId: number, ownerOnly = false) {
  if (!Number.isSafeInteger(accountId) || accountId <= 0) throw new PrintError("Cuenta invalida.");
  const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new PrintError("Sesion requerida.", 401);
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) throw new PrintError("Sesion invalida.", 401);
  const { data: account, error: accountError } = await client.from("accounts")
    .select('id, name, email, phone, address, rtn, "createdById"').eq("id", accountId).single();
  const { data: member, error: memberError } = await client.from("usersToAccounts")
    .select('"userId"').eq("accountId", accountId).eq("userId", user.id).maybeSingle();
  if (accountError || memberError || !account || !member) throw new PrintError("Sin acceso a esta cuenta.", 403);
  if (ownerOnly) {
    if (account.createdById !== user.id) throw new PrintError("Solo el propietario puede gestionar integraciones.", 403);
  } else {
    const { data, error: profileError } = await client.from("users_to_profiles")
      .select('account_profiles!inner(accountId, isSystemAdmin, permissions)')
      .eq("accountId", accountId).eq("userId", user.id).single();
    const profile = data?.account_profiles;
    if (profileError || Number(profile?.accountId) !== accountId ||
      (!profile?.isSystemAdmin && profile?.permissions?.sales?.read !== true)) {
      throw new PrintError("Sin permiso de lectura de ventas.", 403);
    }
  }
  return { user, account };
}

export function imprentBaseUrl() {
  const raw = Deno.env.get("IMPRENT_BASE_URL");
  if (!raw) throw new PrintError("Falta configurar IMPRENT_BASE_URL en el servidor.", 412);
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new PrintError("IMPRENT_BASE_URL debe ser una URL HTTPS sin credenciales.", 412);
  }
  return raw.replace(/\/+$/, "");
}

// Only a server-configured origin is used; never follow provider download URLs
// or redirects with tenant credentials (SSRF / credential leakage).
export async function imprentRequest(path: string, init: RequestInit = {}, apiKey?: string) {
  const headers = new Headers(init.headers);
  if (apiKey) headers.set("X-API-Key", apiKey);
  const baseUrl = imprentBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/${path}`, {
      ...init, headers, redirect: "error", signal: AbortSignal.timeout(90000),
    });
  } catch {
    throw new PrintError("Imprent no respondio. Intenta nuevamente.", 502);
  }
  if (!response.ok) throw new PrintError(`Imprent rechazo la solicitud (${response.status}). Revisa la activacion y facturacion.`, 502);
  return response;
}

export async function imprentJson(path: string, init: RequestInit = {}, apiKey?: string) {
  const response = await imprentRequest(path, init, apiKey);
  const payload = await response.json().catch(() => null);
  if (!payload || payload.error === true) throw new PrintError("Respuesta invalida de Imprent.", 502);
  return payload.data ?? payload;
}

export async function getIntegration(client: any, accountId: number) {
  const { data, error } = await client.from("account_integrations").select("*")
    .eq("accountId", accountId).eq("provider", "imprent").maybeSingle();
  if (error) throw new PrintError("No se pudo cargar la integracion. Verifica la migracion.", 500);
  return data;
}

export async function requireIntegration(client: any, accountId: number) {
  const config = await getIntegration(client, accountId);
  if (!config?.isActive || !config.credentials?.apiKey) throw new PrintError("Activa Imprent en Configuracion > Integraciones.", 412);
  return config;
}

export function printErrorResponse(error: unknown) {
  return json({ error: error instanceof PrintError ? error.message : "No se pudo completar la operacion de impresion." },
    error instanceof PrintError ? error.status : 500);
}
