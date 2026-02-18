import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listPendingInvitationsForCurrentUser, markInvitationAccepted } from "../services/invitationsService";
import { formatDateTime } from "../utils/dateFormat";

function AccountInvitationsPage() {
  const { t, language } = useI18n();
  const { refreshAccounts, switchAccount } = useAuth();
  const [invitations, setInvitations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    try {
      setIsLoading(true);
      const rows = await listPendingInvitationsForCurrentUser();
      setInvitations(rows);
      setError("");
    } catch {
      setInvitations([]);
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptInvitation = async (invitationId, email) => {
    try {
      const accepted = await markInvitationAccepted({ invitationId: Number(invitationId), email: (email || "").toLowerCase() });
      await refreshAccounts?.();
      if (accepted?.accountId) {
        switchAccount?.(Number(accepted.accountId));
      }
      setMessage(t("accountManage.invitationAccepted"));
      setError("");
      await loadInvitations();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  return (
    <div className="module-page">
      <h1>{t("accountManage.pendingInvitationsTitle")}</h1>
      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <table className="crud-table">
          <thead>
            <tr>
              <th>{t("common.account")}</th>
              <th>{t("admin.profile")}</th>
              <th>{t("admin.expiresAt")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {invitations.length === 0 ? (
              <tr>
                <td colSpan={4}>{t("common.empty")}</td>
              </tr>
            ) : (
              invitations.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.accounts?.name ?? `${t("topbar.currentAccount")} #${inv.accountId}`}</td>
                  <td>{inv.account_profiles?.name ?? "-"}</td>
                  <td>{formatDateTime(inv.expiresAt, language)}</td>
                  <td>
                    <button type="button" className="button-link-primary" onClick={() => handleAcceptInvitation(inv.id, inv.email)}>
                      {t("accountManage.acceptInvitation")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AccountInvitationsPage;
