import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface AcceptPayload {
  invitationId: number;
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

    const payload = (await req.json()) as AcceptPayload;
    if (!payload?.invitationId) {
      return new Response(JSON.stringify({ success: false, error: "Missing invitationId" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 400
      });
    }

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

    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from("account_user_invitations")
      .select('id, email, "accountId", "profileId", status, "expiresAt", "invalidatedAt"')
      .eq("id", payload.invitationId)
      .maybeSingle();

    if (invitationError || !invitation) {
      return new Response(JSON.stringify({ success: false, error: "Invitation not found" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 404
      });
    }

    if ((user.email || "").toLowerCase() !== (invitation.email || "").toLowerCase()) {
      return new Response(JSON.stringify({ success: false, error: "Invitation email mismatch" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 403
      });
    }

    if (invitation.invalidatedAt) {
      return new Response(JSON.stringify({ success: false, error: "Invitation has been invalidated" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 409
      });
    }

    if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() < Date.now()) {
      await supabaseAdmin.from("account_user_invitations").update({ status: "expired" }).eq("id", invitation.id);
      return new Response(JSON.stringify({ success: false, error: "Invitation has expired" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 410
      });
    }

    if (invitation.status === "linked") {
      return new Response(JSON.stringify({ success: true, accountId: invitation.accountId }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 200
      });
    }

    if (!["pending", "sent"].includes(invitation.status)) {
      return new Response(JSON.stringify({ success: false, error: "Invitation is not available" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 409
      });
    }

    const { data: existingMembership, error: membershipError } = await supabaseAdmin
      .from("usersToAccounts")
      .select('id, "accountId", "userId"')
      .eq("userId", user.id)
      .eq("accountId", invitation.accountId)
      .maybeSingle();

    if (membershipError) {
      throw membershipError;
    }

    if (!existingMembership) {
      const { error: linkError } = await supabaseAdmin.from("usersToAccounts").insert({
        userId: user.id,
        accountId: invitation.accountId
      });
      if (linkError) throw linkError;
    }

    if (invitation.profileId) {
      const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
        .from("users_to_profiles")
        .select('id, "accountId", "userId"')
        .eq("userId", user.id)
        .eq("accountId", invitation.accountId)
        .maybeSingle();
      if (existingProfileError) throw existingProfileError;

      if (existingProfile) {
        const { error: updateProfileError } = await supabaseAdmin
          .from("users_to_profiles")
          .update({ profileId: invitation.profileId })
          .eq("id", existingProfile.id);
        if (updateProfileError) throw updateProfileError;
      } else {
        const { error: insertProfileError } = await supabaseAdmin.from("users_to_profiles").insert({
          accountId: invitation.accountId,
          userId: user.id,
          profileId: invitation.profileId
        });
        if (insertProfileError) throw insertProfileError;
      }
    }

    const { error: invitationUpdateError } = await supabaseAdmin
      .from("account_user_invitations")
      .update({ status: "linked" })
      .eq("id", invitation.id);
    if (invitationUpdateError) throw invitationUpdateError;

    return new Response(JSON.stringify({ success: true, accountId: invitation.accountId }), {
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
