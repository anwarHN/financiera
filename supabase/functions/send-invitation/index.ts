import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface InvitePayload {
  accountId: number;
  email?: string;
  profileId?: number;
  appUrl: string;
  resendInvitationId?: number;
}

async function findAuthUserByEmail(supabaseAdmin: ReturnType<typeof createClient>, email: string) {
  const target = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const found = users.find((row) => (row.email || "").toLowerCase() === target);
    if (found) return found;
    if (users.length < perPage) break;
    page += 1;
  }

  return null;
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

    let normalizedEmail = (payload.email || "").trim().toLowerCase();
    let profileId = payload.profileId ? Number(payload.profileId) : null;

    if (payload.resendInvitationId) {
      const { data: previousInvitation, error: previousInvitationError } = await supabaseAdmin
        .from("account_user_invitations")
        .select('id, email, "profileId", status, "accountId", "expiresAt"')
        .eq("id", payload.resendInvitationId)
        .eq("accountId", payload.accountId)
        .maybeSingle();

      if (previousInvitationError || !previousInvitation) {
        return new Response(JSON.stringify({ success: false, error: "Invitation to resend not found" }), {
          headers: { ...corsHeaders, "content-type": "application/json" },
          status: 404
        });
      }

      normalizedEmail = (previousInvitation.email || "").trim().toLowerCase();
      profileId = previousInvitation.profileId ? Number(previousInvitation.profileId) : null;

      const { error: invalidateError } = await supabaseAdmin
        .from("account_user_invitations")
        .update({ status: "invalidated", invalidatedAt: new Date().toISOString() })
        .eq("id", previousInvitation.id)
        .eq("accountId", payload.accountId);

      if (invalidateError) {
        throw invalidateError;
      }
    }

    if (!normalizedEmail || !profileId) {
      return new Response(JSON.stringify({ success: false, error: "Missing invitation data" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
        status: 400
      });
    }

    if (!payload.resendInvitationId) {
      const { data: existingSentInvitation, error: existingSentInvitationError } = await supabaseAdmin
        .from("account_user_invitations")
        .select('id, status, "expiresAt"')
        .eq("accountId", payload.accountId)
        .eq("email", normalizedEmail)
        .eq("status", "sent")
        .gt("expiresAt", new Date().toISOString())
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSentInvitationError) {
        throw existingSentInvitationError;
      }

      if (existingSentInvitation?.id) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "An active invitation already exists for this email. Use resend invitation."
          }),
          {
            headers: { ...corsHeaders, "content-type": "application/json" },
            status: 409
          }
        );
      }
    }

    const { data: invitation, error: insertError } = await supabaseAdmin
      .from("account_user_invitations")
      .insert({
        accountId: payload.accountId,
        email: normalizedEmail,
        profileId,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdById: user.id
      })
      .select('id, "expiresAt"')
      .single();

    if (insertError) {
      throw insertError;
    }

    const redirectTo = `${payload.appUrl.replace(/\/$/, "")}/accept-invitation/${invitation.id}?email=${encodeURIComponent(normalizedEmail)}`;

    const existingUser = await findAuthUserByEmail(supabaseAdmin, normalizedEmail);

    if (existingUser) {
      const { error: otpError } = await supabaseAdmin.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectTo,
          data: {
            invitation_id: invitation.id
          }
        }
      });

      if (otpError) {
        throw otpError;
      }
    } else {
      const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
        redirectTo,
        data: {
          invitation_id: invitation.id
        }
      });

      if (inviteError) {
        throw inviteError;
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("account_user_invitations")
      .update({ status: "sent", sentAt: new Date().toISOString() })
      .eq("id", invitation.id);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true, invitationId: invitation.id, expiresAt: invitation.expiresAt }),
      {
      headers: { ...corsHeaders, "content-type": "application/json" },
      status: 200
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
      status: 400
    });
  }
});
