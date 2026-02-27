import { supabase } from "../lib/supabase";

async function parseFunctionError(error, fallback) {
  try {
    const response = error?.context;
    if (response && typeof response.json === "function") {
      const payload = await response.json();
      if (payload?.error) return payload.error;
    }
  } catch {
    // ignore JSON parsing errors and use fallback
  }
  return error?.message || fallback;
}

export async function listAccountUsers(accountId) {
  let {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }

  if (!session?.access_token) {
    throw new Error("Missing auth session for list users request.");
  }

  const { data, error } = await supabase.functions.invoke("list-account-users", {
    body: { accountId },
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  if (error) {
    throw new Error(`List users function error: ${error.message ?? "unknown error"}`);
  }

  if (data?.success === false) {
    throw new Error(`List users failed: ${data.error ?? "unknown function error"}`);
  }

  return data?.users ?? [];
}

export async function listInvitations(accountId) {
  const { data, error } = await supabase
    .from("account_user_invitations")
    .select('id, email, status, "profileId", "created_at", "expiresAt", account_profiles(name)')
    .eq("accountId", accountId)
    .order("id", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function sendInvitation(payload) {
  let {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }

  if (!session?.access_token) {
    throw new Error("Missing auth session for invitation request.");
  }

  const { data, error } = await supabase.functions.invoke("send-invitation", {
    body: payload,
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  if (error) {
    const message = await parseFunctionError(error, "unknown error");
    throw new Error(`Invitation function error: ${message}`);
  }

  if (data?.success === false) {
    throw new Error(`Invitation failed: ${data.error ?? "unknown function error"}`);
  }

  return data;
}

export async function resendInvitation(payload) {
  let {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }

  if (!session?.access_token) {
    throw new Error("Missing auth session for invitation resend request.");
  }

  const { data, error } = await supabase.functions.invoke("send-invitation", {
    body: payload,
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  if (error) {
    const message = await parseFunctionError(error, "unknown error");
    throw new Error(`Invitation resend function error: ${message}`);
  }

  if (data?.success === false) {
    throw new Error(`Invitation resend failed: ${data.error ?? "unknown function error"}`);
  }

  return data;
}

export async function deactivateAccountUser(payload) {
  let {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }

  if (!session?.access_token) {
    throw new Error("Missing auth session for deactivate user request.");
  }

  const { data, error } = await supabase.functions.invoke("deactivate-account-user", {
    body: payload,
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  if (error) {
    throw new Error(`Deactivate user function error: ${error.message ?? "unknown error"}`);
  }

  if (data?.success === false) {
    throw new Error(`Deactivate user failed: ${data.error ?? "unknown function error"}`);
  }

  return data;
}
