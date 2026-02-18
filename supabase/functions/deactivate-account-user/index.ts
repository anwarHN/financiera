import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface Payload {
  accountId: number;
  userId: string;
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

async function syncSeatsIfSubscriptionActive(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  accountId: number;
  paypalPlanId: string;
}) {
  const { supabaseAdmin, accountId, paypalPlanId } = args;
  const { data: account } = await supabaseAdmin
    .from("accounts")
    .select('id, "paypalSubscriptionId", "stripeSubscriptionId", "billingStatus"')
    .eq("id", accountId)
    .single();

  const subscriptionId = account?.paypalSubscriptionId || account?.stripeSubscriptionId;
  if (!subscriptionId || !["active", "past_due", "trialing", "incomplete"].includes(account.billingStatus)) {
    return;
  }

  const { count: seatsCount } = await supabaseAdmin
    .from("usersToAccounts")
    .select("*", { count: "exact", head: true })
    .eq("accountId", accountId);
  const targetSeats = Math.max(1, seatsCount ?? 1);

  const accessToken = await getPayPalAccessToken();
  const reviseResponse = await fetch(`${getPayPalBaseUrl()}/v1/billing/subscriptions/${subscriptionId}/revise`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      plan_id: paypalPlanId,
      quantity: String(targetSeats)
    })
  });

  const revisePayload = await reviseResponse.json();
  if (!reviseResponse.ok) {
    throw new Error(revisePayload?.message ?? revisePayload?.name ?? `PayPal error (${reviseResponse.status})`);
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
    if (!payload?.accountId || !payload?.userId) {
      return new Response(JSON.stringify({ success: false, error: "Missing accountId/userId" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 400
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paypalPlanId = Deno.env.get("PAYPAL_PLAN_ID_MONTHLY") || Deno.env.get("PAYPAL_PLAN_ID");
    if (!supabaseUrl || !serviceRoleKey || !paypalPlanId) {
      return new Response(JSON.stringify({ success: false, error: "Missing function secrets." }), {
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

    if (payload.userId === user.id) {
      return new Response(JSON.stringify({ success: false, error: "You cannot deactivate your own user." }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 400
      });
    }

    const { data: actorProfile } = await supabaseAdmin
      .from("users_to_profiles")
      .select('account_profiles("isSystemAdmin","canCreateUsers")')
      .eq("accountId", payload.accountId)
      .eq("userId", user.id)
      .maybeSingle();

    const canManageUsers = Boolean(actorProfile?.account_profiles?.isSystemAdmin || actorProfile?.account_profiles?.canCreateUsers);
    if (!canManageUsers) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 403
      });
    }

    await supabaseAdmin.from("users_to_profiles").delete().eq("accountId", payload.accountId).eq("userId", payload.userId);
    const { error: unlinkError } = await supabaseAdmin
      .from("usersToAccounts")
      .delete()
      .eq("accountId", payload.accountId)
      .eq("userId", payload.userId);
    if (unlinkError) throw unlinkError;

    await syncSeatsIfSubscriptionActive({
      supabaseAdmin,
      accountId: payload.accountId,
      paypalPlanId
    });

    await supabaseAdmin.from("account_billing_events").insert({
      accountId: payload.accountId,
      eventType: "user.deactivated",
      payload: { userId: payload.userId, provider: "paypal" }
    });

    return new Response(JSON.stringify({ success: true }), {
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
