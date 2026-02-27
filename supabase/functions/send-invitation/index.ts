import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface InvitePayload {
  accountId: number;
  email?: string;
  profileId?: number;
  appUrl: string;
  resendInvitationId?: number;
}

class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "content-type": "application/json" },
    status
  });
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizeAppUrl(appUrl: string) {
  const trimmed = String(appUrl || "").trim();
  if (!trimmed) {
    throw new HttpError(400, "invalid_app_url", "Missing appUrl.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new HttpError(400, "invalid_app_url", "Invalid appUrl format.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new HttpError(400, "invalid_app_url", "appUrl must use http or https.");
  }

  return parsed.toString().replace(/\/$/, "");
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ success: false, error: "Method not allowed", code: "method_not_allowed" }, 405);
    }

    const payload = (await req.json()) as InvitePayload;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          success: false,
          error: "Missing function secrets SUPABASE_URL or SERVICE_ROLE_KEY.",
          code: "missing_secrets"
        },
        500
      );
    }

    const accountId = Number(payload.accountId);
    if (!Number.isFinite(accountId) || accountId <= 0) {
      throw new HttpError(400, "invalid_account_id", "Missing or invalid accountId.");
    }
    const appUrl = normalizeAppUrl(payload.appUrl);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!accessToken) {
      return jsonResponse({ success: false, error: "Missing bearer token", code: "missing_token" }, 401);
    }

    const {
      data: { user },
      error: userError
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user) {
      return jsonResponse({ success: false, error: "Invalid token", code: "invalid_token" }, 401);
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("usersToAccounts")
      .select('"userId","accountId"')
      .eq("userId", user.id)
      .eq("accountId", accountId)
      .maybeSingle();

    if (membershipError) {
      return jsonResponse(
        { success: false, error: `Membership query failed: ${membershipError.message}`, code: "membership_query_failed" },
        400
      );
    }

    if (!membership) {
      return jsonResponse({ success: false, error: "Forbidden for this account", code: "forbidden" }, 403);
    }

    let normalizedEmail = (payload.email || "").trim().toLowerCase();
    let profileId = payload.profileId ? Number(payload.profileId) : null;
    const resendInvitationId = payload.resendInvitationId ? Number(payload.resendInvitationId) : null;

    if (resendInvitationId) {
      const { data: previousInvitation, error: previousInvitationError } = await supabaseAdmin
        .from("account_user_invitations")
        .select('id, email, "profileId", status, "accountId", "expiresAt"')
        .eq("id", resendInvitationId)
        .eq("accountId", accountId)
        .maybeSingle();

      if (previousInvitationError || !previousInvitation) {
        return jsonResponse({ success: false, error: "Invitation to resend not found", code: "invitation_not_found" }, 404);
      }

      normalizedEmail = (previousInvitation.email || "").trim().toLowerCase();
      profileId = previousInvitation.profileId ? Number(previousInvitation.profileId) : null;

      const { error: invalidateError } = await supabaseAdmin
        .from("account_user_invitations")
        .update({ status: "invalidated", invalidatedAt: new Date().toISOString() })
        .eq("id", previousInvitation.id)
        .eq("accountId", accountId);

      if (invalidateError) {
        throw invalidateError;
      }
    }

    if (!normalizedEmail || !profileId) {
      return jsonResponse({ success: false, error: "Missing invitation data", code: "missing_invitation_data" }, 400);
    }

    const profileIdNumber = Number(profileId);
    if (!Number.isFinite(profileIdNumber) || profileIdNumber <= 0) {
      return jsonResponse({ success: false, error: "Invalid profileId.", code: "invalid_profile_id" }, 400);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("account_profiles")
      .select("id")
      .eq("id", profileIdNumber)
      .eq("accountId", accountId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      return jsonResponse({ success: false, error: "Profile not found for this account.", code: "profile_not_found" }, 404);
    }

    if (!resendInvitationId) {
      const { data: existingSentInvitation, error: existingSentInvitationError } = await supabaseAdmin
        .from("account_user_invitations")
        .select('id, status, "expiresAt"')
        .eq("accountId", accountId)
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
        return jsonResponse(
          {
            success: false,
            error: "An active invitation already exists for this email. Use resend invitation.",
            code: "active_invitation_exists"
          },
          409
        );
      }
    }

    const { data: invitation, error: insertError } = await supabaseAdmin
      .from("account_user_invitations")
      .insert({
        accountId,
        email: normalizedEmail,
        profileId: profileIdNumber,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdById: user.id
      })
      .select('id, "expiresAt"')
      .single();

    if (insertError) {
      throw insertError;
    }

    const redirectTo = `${appUrl}/accept-invitation/${invitation.id}?email=${encodeURIComponent(normalizedEmail)}`;

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

    return jsonResponse({ success: true, invitationId: invitation.id, expiresAt: invitation.expiresAt }, 200);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ success: false, error: error.message, code: error.code }, error.status);
    }

    console.error("send-invitation unexpected error:", error);
    return jsonResponse(
      { success: false, error: toErrorMessage(error), code: "unexpected_error" },
      500
    );
  }
});
