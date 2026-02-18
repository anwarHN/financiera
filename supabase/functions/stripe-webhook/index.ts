import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,paypal-auth-algo,paypal-cert-url,paypal-transmission-id,paypal-transmission-sig,paypal-transmission-time",
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

function mapPayPalStatusToBillingStatus(status?: string | null) {
  const normalized = (status || "").toUpperCase();
  if (normalized === "ACTIVE") return "active";
  if (normalized === "APPROVAL_PENDING" || normalized === "APPROVED") return "incomplete";
  if (normalized === "SUSPENDED") return "past_due";
  if (normalized === "CANCELLED" || normalized === "EXPIRED") return "canceled";
  return "trialing";
}

async function verifyWebhookSignature(args: { accessToken: string; body: unknown; webhookId: string; headers: Headers }) {
  const response = await fetch(`${getPayPalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      auth_algo: args.headers.get("paypal-auth-algo"),
      cert_url: args.headers.get("paypal-cert-url"),
      transmission_id: args.headers.get("paypal-transmission-id"),
      transmission_sig: args.headers.get("paypal-transmission-sig"),
      transmission_time: args.headers.get("paypal-transmission-time"),
      webhook_id: args.webhookId,
      webhook_event: args.body
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.name ?? `PayPal verify error (${response.status})`);
  }

  return payload?.verification_status === "SUCCESS";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { headers: corsHeaders, status: 405 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID");
    if (!supabaseUrl || !serviceRoleKey || !webhookId) {
      return new Response("Missing secrets", { headers: corsHeaders, status: 500 });
    }

    const event = await req.json();
    const accessToken = await getPayPalAccessToken();
    const isValid = await verifyWebhookSignature({
      accessToken,
      body: event,
      webhookId,
      headers: req.headers
    });

    if (!isValid) {
      return new Response("Invalid webhook signature", { headers: corsHeaders, status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const eventType = String(event?.event_type || "paypal.unknown");
    const resource = event?.resource || {};
    const subscriptionId = String(resource?.id || resource?.billing_agreement_id || "");
    const status = String(resource?.status || "");
    const planId = resource?.plan_id ?? null;
    const customId = resource?.custom_id ? Number(resource.custom_id) : null;
    const nextBillingTime = resource?.billing_info?.next_billing_time ?? null;

    let accountId: number | null = customId && Number.isFinite(customId) ? customId : null;

    if (!accountId && subscriptionId) {
      const { data: accountByPayPalSub } = await supabaseAdmin
        .from("accounts")
        .select("id")
        .eq("paypalSubscriptionId", subscriptionId)
        .maybeSingle();
      accountId = accountByPayPalSub?.id ?? null;
    }

    if (!accountId && subscriptionId) {
      const { data: accountByLegacySub } = await supabaseAdmin
        .from("accounts")
        .select("id")
        .eq("stripeSubscriptionId", subscriptionId)
        .maybeSingle();
      accountId = accountByLegacySub?.id ?? null;
    }

    if (accountId) {
      await supabaseAdmin
        .from("accounts")
        .update({
          paypalSubscriptionId: subscriptionId || null,
          stripeSubscriptionId: subscriptionId || null,
          subscriptionPriceId: planId,
          billingStatus: mapPayPalStatusToBillingStatus(status),
          subscriptionCurrentPeriodEnd: nextBillingTime
        })
        .eq("id", accountId);
    }

    await supabaseAdmin.from("account_billing_events").insert({
      accountId,
      eventType,
      stripeEventId: event?.id ?? null,
      payload: {
        provider: "paypal",
        resource
      }
    });

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
      status: 200
    });
  } catch (error) {
    return new Response(`Webhook Error: ${String(error)}`, {
      headers: corsHeaders,
      status: 400
    });
  }
});
