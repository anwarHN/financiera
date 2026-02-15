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

async function stripeRequest(path: string, secretKey: string, params: URLSearchParams) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Stripe error (${response.status})`);
  }
  return payload;
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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripePriceId = Deno.env.get("STRIPE_PRICE_ID_MONTHLY");
    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !stripePriceId) {
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
      .select('id, name, email, "trialEndsAt", "stripeCustomerId"')
      .eq("id", payload.accountId)
      .single();

    if (accountError || !account) throw accountError ?? new Error("Account not found");

    const { count: seatsCount, error: seatError } = await supabaseAdmin
      .from("usersToAccounts")
      .select("*", { count: "exact", head: true })
      .eq("accountId", payload.accountId);
    if (seatError) throw seatError;

    let stripeCustomerId = account.stripeCustomerId as string | null;
    if (!stripeCustomerId) {
      const customer = await stripeRequest(
        "/v1/customers",
        stripeSecretKey,
        new URLSearchParams({
          name: account.name ?? `Account ${payload.accountId}`,
          email: account.email ?? user.email ?? "",
          "metadata[accountId]": String(payload.accountId)
        })
      );
      stripeCustomerId = customer.id;
      const { error: updateCustomerError } = await supabaseAdmin
        .from("accounts")
        .update({ stripeCustomerId })
        .eq("id", payload.accountId);
      if (updateCustomerError) throw updateCustomerError;
    }

    const successUrl = `${payload.appUrl.replace(/\/$/, "")}/account/billing?checkout=success`;
    const cancelUrl = `${payload.appUrl.replace(/\/$/, "")}/account/billing?checkout=cancel`;
    const trialEnd = account.trialEndsAt ? Math.floor(new Date(account.trialEndsAt as string).getTime() / 1000) : null;
    const nowTs = Math.floor(Date.now() / 1000);

    const params = new URLSearchParams({
      mode: "subscription",
      customer: stripeCustomerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      "line_items[0][price]": stripePriceId,
      "line_items[0][quantity]": String(Math.max(1, seatsCount ?? 1)),
      client_reference_id: String(payload.accountId),
      "metadata[accountId]": String(payload.accountId)
    });

    if (trialEnd && trialEnd > nowTs) {
      params.append("subscription_data[trial_end]", String(trialEnd));
    }

    const session = await stripeRequest("/v1/checkout/sessions", stripeSecretKey, params);

    return new Response(JSON.stringify({ success: true, url: session.url, sessionId: session.id }), {
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
