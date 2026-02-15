import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface InvitePayload {
  accountId: number;
  email: string;
  profileId: number;
  appUrl: string;
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

    const payload = (await req.json()) as InvitePayload;

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

    if (membershipError) {
      return new Response(
        JSON.stringify({ success: false, error: `Membership query failed: ${membershipError.message}` }),
        {
          headers: { ...corsHeaders, "content-type": "application/json" },
          status: 400
        }
      );
    }

    if (!membership) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden for this account" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 403
      });
    }

    const normalizedEmail = payload.email.trim().toLowerCase();

    const { data: invitation, error: insertError } = await supabaseAdmin
      .from("account_user_invitations")
      .insert({
        accountId: payload.accountId,
        email: normalizedEmail,
        profileId: payload.profileId,
        status: "pending",
        createdById: user.id
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    const redirectTo = `${payload.appUrl.replace(/\/$/, "")}/accept-invitation/${invitation.id}?email=${encodeURIComponent(normalizedEmail)}`;

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo,
      data: {
        invitation_id: invitation.id
      }
    });

    if (inviteError) {
      throw inviteError;
    }

    const { error: updateError } = await supabaseAdmin
      .from("account_user_invitations")
      .update({ status: "sent" })
      .eq("id", invitation.id);

    if (updateError) {
      throw updateError;
    }

    return new Response(JSON.stringify({ success: true, invitationId: invitation.id }), {
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
