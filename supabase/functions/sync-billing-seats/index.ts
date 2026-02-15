import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface Payload {
  accountId: number;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

async function stripeRequest(path: string, secretKey: string, params?: URLSearchParams, method = "POST") {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params ? params.toString() : undefined
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Stripe error (${response.status})`);
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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
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
      .select('id, "stripeSubscriptionId", "billingStatus"')
      .eq("id", payload.accountId)
      .single();

    if (!account?.stripeSubscriptionId || !["active", "past_due", "trialing"].includes(account.billingStatus)) {
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

    const subscription = await stripeRequest(`/v1/subscriptions/${account.stripeSubscriptionId}`, stripeSecretKey, undefined, "GET");
    const itemId = subscription?.items?.data?.[0]?.id;
    if (!itemId) {
      throw new Error("Subscription item not found");
    }

    await stripeRequest(
      `/v1/subscription_items/${itemId}`,
      stripeSecretKey,
      new URLSearchParams({
        quantity: String(targetSeats),
        proration_behavior: "create_prorations"
      })
    );

    await supabaseAdmin.from("account_billing_events").insert({
      accountId: payload.accountId,
      eventType: "seats.synced",
      payload: { targetSeats, subscriptionId: account.stripeSubscriptionId }
    });

    return new Response(JSON.stringify({ success: true, synced: true, seats: targetSeats }), {
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
