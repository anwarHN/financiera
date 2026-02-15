import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface UsersPayload {
  accountId: number;
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

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

    const payload = (await req.json()) as UsersPayload;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")!;

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

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("usersToAccounts")
      .select('"userId","accountId"')
      .eq("userId", user.id)
      .eq("accountId", payload.accountId)
      .maybeSingle();

    if (membershipError || !membership) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden for this account" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 403
      });
    }

    const { data: usersToAccount, error: usersError } = await supabaseAdmin
      .from("usersToAccounts")
      .select('"userId"')
      .eq("accountId", payload.accountId)
      .order("userId", { ascending: true });

    if (usersError) {
      throw usersError;
    }

    const userIds = (usersToAccount ?? []).map((row) => row.userId);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ success: true, users: [] }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 200
      });
    }

    const users = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) {
        throw error;
      }

      for (const row of data.users ?? []) {
        if (userIds.includes(row.id)) {
          users.push({ userId: row.id, email: row.email ?? row.user_metadata?.email ?? null });
        }
      }

      if (!data?.users || data.users.length < perPage) {
        break;
      }

      page += 1;
    }

    return new Response(JSON.stringify({ success: true, users }), {
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
