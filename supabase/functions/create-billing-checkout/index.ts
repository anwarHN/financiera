import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface CheckoutPayload {
  accountId: number;
  appUrl: string;
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

function mapPayPalStatusToBillingStatus(status?: string | null) {
  const normalized = (status || "").toUpperCase();
  if (normalized === "ACTIVE") return "active";
  if (normalized === "APPROVAL_PENDING" || normalized === "APPROVED") return "incomplete";
  if (normalized === "SUSPENDED") return "past_due";
  if (normalized === "CANCELLED" || normalized === "EXPIRED") return "canceled";
  return "trialing";
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

    const payload = (await req.json()) as CheckoutPayload;
    if (!payload?.accountId || !payload?.appUrl) {
      return new Response(JSON.stringify({ success: false, error: "Missing accountId/appUrl" }), {
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
      return new Response(JSON.stringify({ success: false, error: `Invalid token: ${userError?.message ?? "unknown"}` }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 401
      });
    }

    const { data: profileLink } = await supabaseAdmin
      .from("users_to_profiles")
      .select('"profileId", account_profiles("isSystemAdmin","canCreateUsers")')
      .eq("accountId", payload.accountId)
      .eq("userId", user.id)
      .maybeSingle();

    const canManageBilling = Boolean(profileLink?.account_profiles?.isSystemAdmin || profileLink?.account_profiles?.canCreateUsers);
    if (!canManageBilling) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 403
      });
    }

    const { data: account, error: accountError } = await supabaseAdmin
      .from("accounts")
      .select('id, name, email, "trialEndsAt"')
      .eq("id", payload.accountId)
      .single();

    if (accountError || !account) throw accountError ?? new Error("Account not found");

    const { count: seatsCount, error: seatError } = await supabaseAdmin
      .from("usersToAccounts")
      .select("*", { count: "exact", head: true })
      .eq("accountId", payload.accountId);
    if (seatError) throw seatError;

    const targetSeats = Math.max(1, seatsCount ?? 1);
    const paypalAccessToken = await getPayPalAccessToken();

    const createBody: Record<string, unknown> = {
      plan_id: paypalPlanId,
      quantity: String(targetSeats),
      custom_id: String(payload.accountId),
      application_context: {
        brand_name: account.name ?? `Account ${payload.accountId}`,
        user_action: "SUBSCRIBE_NOW",
        return_url: `${payload.appUrl.replace(/\/$/, "")}/account/billing?checkout=success`,
        cancel_url: `${payload.appUrl.replace(/\/$/, "")}/account/billing?checkout=cancel`
      },
      subscriber: {
        email_address: account.email ?? user.email ?? ""
      }
    };

    const trialEndDate = account.trialEndsAt ? new Date(account.trialEndsAt as string) : null;
    if (trialEndDate && trialEndDate.getTime() > Date.now() + 5 * 60 * 1000) {
      createBody.start_time = trialEndDate.toISOString();
    }

    const subscription = await paypalRequest("/v1/billing/subscriptions", paypalAccessToken, createBody);
    const approvalUrl = subscription?.links?.find((link: { rel?: string; href?: string }) => link.rel === "approve")?.href;
    if (!approvalUrl) {
      throw new Error("PayPal approval URL not found");
    }

    const billingStatus = mapPayPalStatusToBillingStatus(subscription?.status);
    await supabaseAdmin
      .from("accounts")
      .update({
        billingStatus,
        paypalSubscriptionId: subscription.id,
        stripeSubscriptionId: subscription.id,
        subscriptionPriceId: paypalPlanId
      })
      .eq("id", payload.accountId);

    await supabaseAdmin.from("account_billing_events").insert({
      accountId: payload.accountId,
      eventType: "paypal.subscription.created",
      stripeEventId: subscription.id,
      payload: {
        provider: "paypal",
        status: subscription?.status ?? null,
        quantity: targetSeats
      }
    });

    return new Response(JSON.stringify({ success: true, url: approvalUrl, subscriptionId: subscription.id }), {
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
