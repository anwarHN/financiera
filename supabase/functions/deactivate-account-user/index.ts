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

async function syncSeatsIfSubscriptionActive(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  accountId: number;
  stripeSecretKey: string;
}) {
  const { supabaseAdmin, accountId, stripeSecretKey } = args;
  const { data: account } = await supabaseAdmin
    .from("accounts")
    .select('id, "stripeSubscriptionId", "billingStatus"')
    .eq("id", accountId)
    .single();

  if (!account?.stripeSubscriptionId || !["active", "past_due", "trialing"].includes(account.billingStatus)) {
    return;
  }

  const { count: seatsCount } = await supabaseAdmin
    .from("usersToAccounts")
    .select("*", { count: "exact", head: true })
    .eq("accountId", accountId);
  const targetSeats = Math.max(1, seatsCount ?? 1);

  const subscriptionResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${account.stripeSubscriptionId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${stripeSecretKey}` }
  });
  const subscription = await subscriptionResponse.json();
  if (!subscriptionResponse.ok) {
    throw new Error(subscription?.error?.message ?? `Stripe error (${subscriptionResponse.status})`);
  }

  const itemId = subscription?.items?.data?.[0]?.id;
  if (!itemId) {
    throw new Error("Subscription item not found");
  }

  const updateResponse = await fetch(`https://api.stripe.com/v1/subscription_items/${itemId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      quantity: String(targetSeats),
      proration_behavior: "create_prorations"
    }).toString()
  });
  const updatePayload = await updateResponse.json();
  if (!updateResponse.ok) {
    throw new Error(updatePayload?.error?.message ?? `Stripe error (${updateResponse.status})`);
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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
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
      stripeSecretKey
    });

    await supabaseAdmin.from("account_billing_events").insert({
      accountId: payload.accountId,
      eventType: "user.deactivated",
      payload: { userId: payload.userId }
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
