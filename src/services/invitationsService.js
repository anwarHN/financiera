import { supabase } from "../lib/supabase";

export async function markInvitationAccepted({ invitationId, email }) {
  const { error } = await supabase
    .from("account_user_invitations")
    .update({ status: "accepted" })
    .eq("id", invitationId)
    .eq("email", email);

  if (error) {
    throw error;
  }
}
