import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface PortalPayload {
  accountId: number;
  appUrl: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function buildManageUrl(subscriptionId: string) {
  const customTemplate = Deno.env.get("PAYPAL_MANAGE_SUBSCRIPTION_URL_TEMPLATE");
  if (customTemplate && customTemplate.includes("{subscriptionId}")) {
    return customTemplate.replace("{subscriptionId}", encodeURIComponent(subscriptionId));
  }

  const isSandbox = (Deno.env.get("PAYPAL_ENV") || "live").toLowerCase() === "sandbox";
  return `${isSandbox ? "https://www.sandbox.paypal.com" : "https://www.paypal.com"}/myaccount/autopay/connect/${encodeURIComponent(subscriptionId)}`;
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

    const payload = (await req.json()) as PortalPayload;
    if (!payload?.accountId) {
      return new Response(JSON.stringify({ success: false, error: "Missing accountId" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 400
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
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

    const { data: account, error: accountError } = await supabaseAdmin
      .from("accounts")
      .select('"paypalSubscriptionId", "stripeSubscriptionId"')
      .eq("id", payload.accountId)
      .single();

    const subscriptionId = account?.paypalSubscriptionId || account?.stripeSubscriptionId;
    if (accountError || !subscriptionId) {
      return new Response(JSON.stringify({ success: false, error: "Account has no PayPal subscription yet." }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 400
      });
    }

    return new Response(JSON.stringify({ success: true, url: buildManageUrl(subscriptionId) }), {
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
