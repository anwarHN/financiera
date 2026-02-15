import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { getAccountById, updateAccount } from "../services/accountService";
import { getCurrentUserProfile } from "../services/profilesService";

const initialForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
  reportRetentionDays: 30
};

function AccountSettingsPage() {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!account?.accountId || !user?.id) return;
    loadData();
  }, [account?.accountId, user?.id]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [accountData, currentUserProfile] = await Promise.all([
        getAccountById(account.accountId),
        getCurrentUserProfile(account.accountId, user.id)
      ]);

      setForm({
        name: accountData.name ?? "",
        email: accountData.email ?? "",
        phone: accountData.phone ?? "",
        address: accountData.address ?? "",
        reportRetentionDays: Number(accountData.reportRetentionDays ?? 30)
      });
      setIsSystemAdmin(Boolean(currentUserProfile?.account_profiles?.isSystemAdmin));
      setError("");
      setSuccess("");
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "reportRetentionDays" ? Number(value || 1) : value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!account?.accountId || !isSystemAdmin) return;

    try {
      await updateAccount(account.accountId, {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        reportRetentionDays: Math.max(1, Number(form.reportRetentionDays || 30))
      });
      setSuccess(t("accountManage.accountSaved"));
      setError("");
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  if (isLoading) {
    return <p>{t("common.loading")}</p>;
  }

  return (
    <div className="module-page">
      <h1>{t("accountManage.accountSettingsTitle")}</h1>
      {!isSystemAdmin && <p className="error-text">{t("accountManage.adminOnly")}</p>}
      {error && <p className="error-text">{error}</p>}
      {success && <p className="success-text">{success}</p>}

      <form className="crud-form" onSubmit={handleSubmit}>
        <div className="form-grid-2">
          <label className="field-block">
            <span>{t("common.name")}</span>
            <input name="name" value={form.name} onChange={handleChange} disabled={!isSystemAdmin} required />
          </label>
          <label className="field-block">
            <span>{t("common.email")}</span>
            <input name="email" type="email" value={form.email} onChange={handleChange} disabled={!isSystemAdmin} />
          </label>
          <label className="field-block">
            <span>{t("common.phone")}</span>
            <input name="phone" value={form.phone} onChange={handleChange} disabled={!isSystemAdmin} />
          </label>
          <label className="field-block">
            <span>{t("common.address")}</span>
            <input name="address" value={form.address} onChange={handleChange} disabled={!isSystemAdmin} />
          </label>
          <label className="field-block">
            <span>{t("accountManage.reportRetentionDays")}</span>
            <input
              name="reportRetentionDays"
              type="number"
              min={1}
              max={3650}
              value={form.reportRetentionDays}
              onChange={handleChange}
              disabled={!isSystemAdmin}
            />
            <small>{t("accountManage.reportRetentionHint")}</small>
          </label>
        </div>

        <div className="crud-form-actions">
          <button type="submit" disabled={!isSystemAdmin}>
            {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AccountSettingsPage;
