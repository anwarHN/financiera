import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface Payload {
  accountId: number;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function getPayPalBaseUrl() {
  return (Deno.env.get("PAYPAL_ENV") || "live").toLowerCase() === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

async function getPayPalAccessToken() {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Missing PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET");
  }

  const tokenResponse = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    throw new Error(tokenPayload?.error_description ?? tokenPayload?.error ?? `PayPal auth error (${tokenResponse.status})`);
  }

  return tokenPayload.access_token as string;
}

async function paypalRequest(path: string, accessToken: string, body: unknown) {
  const response = await fetch(`${getPayPalBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.name ?? `PayPal error (${response.status})`);
  }
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders, status: 200 });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 405
      });
    }

    const payload = (await req.json()) as Payload;
    if (!payload?.accountId) {
      return new Response(JSON.stringify({ success: false, error: "Missing accountId" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 400
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paypalPlanId = Deno.env.get("PAYPAL_PLAN_ID_MONTHLY") || Deno.env.get("PAYPAL_PLAN_ID");
    if (!supabaseUrl || !serviceRoleKey || !paypalPlanId) {
      return new Response(JSON.stringify({ success: false, error: "Missing secrets" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 500
      });
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
      return new Response(JSON.stringify({ success: false, error: "Invalid token" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 401
      });
    }

    const { data: membership } = await supabaseAdmin
      .from("usersToAccounts")
      .select('"userId"')
      .eq("accountId", payload.accountId)
      .eq("userId", user.id)
      .maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 403
      });
    }

    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select('id, "paypalSubscriptionId", "stripeSubscriptionId", "billingStatus"')
      .eq("id", payload.accountId)
      .single();

    const subscriptionId = account?.paypalSubscriptionId || account?.stripeSubscriptionId;
    if (!subscriptionId || !["active", "past_due", "trialing", "incomplete"].includes(account.billingStatus)) {
      return new Response(JSON.stringify({ success: true, synced: false, reason: "No active subscription" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 200
      });
    }

    const { count: seatsCount } = await supabaseAdmin
      .from("usersToAccounts")
      .select("*", { count: "exact", head: true })
      .eq("accountId", payload.accountId);
    const targetSeats = Math.max(1, seatsCount ?? 1);

    const paypalAccessToken = await getPayPalAccessToken();
    const revise = await paypalRequest(`/v1/billing/subscriptions/${subscriptionId}/revise`, paypalAccessToken, {
      plan_id: paypalPlanId,
      quantity: String(targetSeats)
    });

    const approvalUrl = revise?.links?.find((link: { rel?: string; href?: string }) => link.rel === "approve")?.href ?? null;

    await supabaseAdmin.from("account_billing_events").insert({
      accountId: payload.accountId,
      eventType: "paypal.seats.synced",
      payload: {
        targetSeats,
        subscriptionId,
        requiresApproval: Boolean(approvalUrl)
      }
    });

    return new Response(JSON.stringify({ success: true, synced: true, seats: targetSeats, requiresApproval: Boolean(approvalUrl), url: approvalUrl }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
      status: 200
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
      status: 400
    });
  }
});
