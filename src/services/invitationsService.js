import { supabase } from "../lib/supabase";

export async function markInvitationAccepted({ invitationId, email }) {
  let {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }

  if (!session?.access_token) {
    throw new Error("Missing auth session for invitation accept request.");
  }

  const { data, error } = await supabase.functions.invoke("accept-shared-invitation", {
    body: { invitationId, email },
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  if (error) {
    throw new Error(`Accept invitation function error: ${error.message ?? "unknown error"}`);
  }

  if (data?.success === false) {
    throw new Error(`Accept invitation failed: ${data.error ?? "unknown function error"}`);
  }

  return data;
}

export async function getInvitationById(invitationId) {
  const { data, error } = await supabase
    .from("account_user_invitations")
    .select('id, email, status, "accountId", "profileId"')
    .eq("id", invitationId)
    .maybeSingle();
  if (error) {
    throw error;
  }

  return data ?? null;
}
