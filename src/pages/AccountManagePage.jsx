import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { FiCreditCard, FiSettings, FiShield, FiUserPlus } from "react-icons/fi";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listPendingInvitationsForCurrentUser, markInvitationAccepted } from "../services/invitationsService";

const accountTabs = [
  { path: "/account/billing", key: "accountManage.billing", icon: FiCreditCard },
  { path: "/account/users", key: "accountManage.users", icon: FiUserPlus },
  { path: "/account/profiles", key: "accountManage.profiles", icon: FiShield },
  { path: "/account/settings", key: "accountManage.settings", icon: FiSettings }
];

function AccountManagePage() {
  const { t } = useI18n();
  const { refreshAccounts, switchAccount } = useAuth();
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadPendingInvitations();
  }, []);

  const loadPendingInvitations = async () => {
    try {
      const rows = await listPendingInvitationsForCurrentUser();
      setPendingInvitations(rows);
      setError("");
    } catch {
      setPendingInvitations([]);
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
      await loadPendingInvitations();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  return (
    <div className="account-manage-shell">
      <section className="account-manage-content">
        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
        {pendingInvitations.length > 0 ? (
          <section className="generic-panel">
            <h3>{t("accountManage.pendingInvitationsTitle")}</h3>
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
                {pendingInvitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.accounts?.name ?? `${t("topbar.currentAccount")} #${inv.accountId}`}</td>
                    <td>{inv.account_profiles?.name ?? "-"}</td>
                    <td>{formatDateTime(inv.expiresAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="button-link-primary"
                        onClick={() => handleAcceptInvitation(inv.id, inv.email)}
                      >
                        {t("accountManage.acceptInvitation")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <nav className="app-menu">
          <div className="app-menu-primary">
            {accountTabs.map((item) => (
              <NavLink key={item.path} to={item.path} className={({ isActive }) => `app-menu-entry ${isActive ? "active" : ""}`}>
                {t(item.key)}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="workspace-body single-column">
          <section className="generic-panel">
            <Outlet />
          </section>
        </div>
      </section>
    </div>
  );
}

export default AccountManagePage;
