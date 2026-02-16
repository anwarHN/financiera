import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { deactivateAccountUser, listAccountUsers, listInvitations, resendInvitation, sendInvitation } from "../services/adminService";
import { assignUserProfile, listProfiles, listUserProfiles } from "../services/profilesService";
import { syncBillingSeats } from "../services/billingService";

function AdminPage() {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [userProfiles, setUserProfiles] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [inviteForm, setInviteForm] = useState({ email: "", profileId: "" });
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!account?.accountId) return;
    loadData();
  }, [account?.accountId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadData = async () => {
    try {
      const [usersData, profilesData, userProfilesData, invitationsData] = await Promise.all([
        listAccountUsers(account.accountId),
        listProfiles(account.accountId),
        listUserProfiles(account.accountId),
        listInvitations(account.accountId)
      ]);
      setUsers(usersData);
      setProfiles(profilesData);
      setUserProfiles(userProfilesData);
      setInvitations(invitationsData);
      await syncBillingSeats({ accountId: account.accountId }).catch(() => null);
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    }
  };

  const getUserProfileId = (userId) => {
    const row = userProfiles.find((item) => item.userId === userId);
    return row?.profileId ? String(row.profileId) : "";
  };

  const handleAssignProfile = async (userId, profileId) => {
    try {
      if (!profileId) return;
      await assignUserProfile({ accountId: account.accountId, userId, profileId: Number(profileId) });
      await loadData();
    } catch (err) {
      console.error("Invitation error", err);
      setError(err?.message || t("common.genericSaveError"));
    }
  };

  const handleInviteChange = (event) => {
    const { name, value } = event.target;
    setInviteForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleInvite = async (event) => {
    event.preventDefault();
    setError("");
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      setError(t("common.requiredFields"));
      return;
    }
    if (!inviteForm.email || !inviteForm.profileId || !account?.accountId || !user?.id) {
      setError(t("common.requiredFields"));
      return;
    }

    try {
      const normalizedEmail = inviteForm.email.trim().toLowerCase();
      const hasPendingSent = invitations.some(
        (inv) =>
          (inv.email || "").toLowerCase() === normalizedEmail &&
          inv.status === "sent" &&
          (!inv.expiresAt || new Date(inv.expiresAt).getTime() > Date.now())
      );
      if (hasPendingSent) {
        setError(t("admin.activeInvitationExists"));
        return;
      }

      await sendInvitation({
        accountId: account.accountId,
        email: normalizedEmail,
        profileId: Number(inviteForm.profileId),
        appUrl: window.location.origin
      });
      setInviteForm({ email: "", profileId: "" });
      setToast(t("admin.invitationSent"));
      await loadData();
    } catch (err) {
      setError(err?.message || t("common.genericSaveError"));
    }
  };

  const handleResendInvitation = async (invitationId) => {
    if (!account?.accountId || !invitationId) return;

    try {
      setError("");
      await resendInvitation({
        accountId: account.accountId,
        resendInvitationId: invitationId,
        appUrl: window.location.origin
      });
      setToast(t("admin.invitationResent"));
      await loadData();
    } catch (err) {
      setError(err?.message || t("common.genericSaveError"));
    }
  };

  const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  const handleDeactivateUser = async (targetUserId) => {
    if (!account?.accountId || !targetUserId) return;
    try {
      await deactivateAccountUser({
        accountId: account.accountId,
        userId: targetUserId
      });
      await loadData();
    } catch (err) {
      setError(err?.message || t("common.genericSaveError"));
    }
  };

  return (
    <div className="module-page">
      <h1>{t("admin.title")}</h1>
      {error && <p className="error-text">{error}</p>}
      {toast && <div className="app-toast">{toast}</div>}

      <form className="crud-form" onSubmit={handleInvite}>
        <h3>{t("admin.inviteUser")}</h3>
        <div className="form-grid-2">
          <label className="field-block">
            <span>{t("common.email")}</span>
            <input
              name="email"
              type="email"
              placeholder={t("common.email")}
              value={inviteForm.email}
              onChange={handleInviteChange}
              required
            />
          </label>
          <label className="field-block">
            <span>{t("admin.profile")}</span>
            <select name="profileId" value={inviteForm.profileId} onChange={handleInviteChange} required>
              <option value="">{`-- ${t("admin.selectProfile")} --`}</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="crud-form-actions">
          <button type="submit">{t("admin.createInvite")}</button>
        </div>
      </form>

      <table className="crud-table">
        <thead>
          <tr>
            <th>{t("common.email")}</th>
            <th>{t("admin.userId")}</th>
            <th>{t("admin.profile")}</th>
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((userRow) => (
            <tr key={userRow.userId}>
              <td>{userRow.email ?? "-"}</td>
              <td>{userRow.userId}</td>
              <td>
                <select
                  value={getUserProfileId(userRow.userId)}
                  onChange={(event) => handleAssignProfile(userRow.userId, event.target.value)}
                >
                  <option value="">{`-- ${t("admin.selectProfile")} --`}</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {userRow.userId === user?.id ? (
                  "-"
                ) : (
                  <button type="button" className="button-danger" onClick={() => handleDeactivateUser(userRow.userId)}>
                    {t("admin.deactivateUser")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="crud-table">
        <thead>
          <tr>
            <th>{t("common.email")}</th>
            <th>{t("admin.profile")}</th>
            <th>{t("admin.status")}</th>
            <th>{t("admin.expiresAt")}</th>
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv) => (
            <tr key={inv.id}>
              <td>{inv.email}</td>
              <td>{inv.account_profiles?.name ?? "-"}</td>
              <td>{inv.status}</td>
              <td>{formatDateTime(inv.expiresAt)}</td>
              <td>
                {inv.status === "sent" ? (
                  <button type="button" className="button-secondary" onClick={() => handleResendInvitation(inv.id)}>
                    {t("admin.resendInvite")}
                  </button>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminPage;
