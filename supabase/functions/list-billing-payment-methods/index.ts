import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface Payload {
  accountId: number;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

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
      .select('"stripeCustomerId"')
      .eq("id", payload.accountId)
      .single();

    if (!account?.stripeCustomerId) {
      return new Response(JSON.stringify({ success: true, methods: [], defaultPaymentMethodId: null }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 200
      });
    }

    const customerResponse = await fetch(`https://api.stripe.com/v1/customers/${account.stripeCustomerId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`
      }
    });
    const customer = await customerResponse.json();
    if (!customerResponse.ok) {
      throw new Error(customer?.error?.message ?? `Stripe error (${customerResponse.status})`);
    }
    const defaultPaymentMethodId = customer?.invoice_settings?.default_payment_method ?? null;

    const methodsResponse = await fetch(
      `https://api.stripe.com/v1/payment_methods?customer=${encodeURIComponent(account.stripeCustomerId)}&type=card`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${stripeSecretKey}` }
      }
    );
    const methodsPayload = await methodsResponse.json();
    if (!methodsResponse.ok) {
      throw new Error(methodsPayload?.error?.message ?? `Stripe error (${methodsResponse.status})`);
    }

    const methods =
      methodsPayload?.data?.map((pm: any) => ({
        id: pm.id,
        brand: pm.card?.brand ?? "",
        last4: pm.card?.last4 ?? "",
        expMonth: pm.card?.exp_month ?? "",
        expYear: pm.card?.exp_year ?? ""
      })) ?? [];

    return new Response(JSON.stringify({ success: true, methods, defaultPaymentMethodId }), {
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
