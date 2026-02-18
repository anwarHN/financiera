import { useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { createCheckoutSession, createPortalSession, syncBillingSeats } from "../services/billingService";
import { formatDateTime } from "../utils/dateFormat";

function AccountBillingPage() {
  const { t, language } = useI18n();
  const { account } = useAuth();
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const trialDaysLeft = useMemo(() => {
    if (!account?.trialEndsAt) return 0;
    const ms = new Date(account.trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }, [account?.trialEndsAt]);

  const canManagePortal = account?.billingStatus === "active" || account?.billingStatus === "past_due" || account?.billingStatus === "incomplete";

  const handleStartMembership = async () => {
    if (!account?.accountId) return;
    try {
      setIsBusy(true);
      setError("");
      setInfo("");
      const response = await createCheckoutSession({
        accountId: account.accountId,
        appUrl: window.location.origin
      });
      window.location.href = response.url;
    } catch (err) {
      setError(err?.message || t("common.genericLoadError"));
      setIsBusy(false);
    }
  };

  const handleOpenPortal = async () => {
    if (!account?.accountId) return;
    try {
      setIsBusy(true);
      setError("");
      setInfo("");
      const response = await createPortalSession({
        accountId: account.accountId,
        appUrl: window.location.origin
      });
      window.location.href = response.url;
    } catch (err) {
      setError(err?.message || t("common.genericLoadError"));
      setIsBusy(false);
    }
  };

  const handleSyncSeats = async () => {
    if (!account?.accountId) return;
    try {
      setIsBusy(true);
      setError("");
      setInfo("");
      const response = await syncBillingSeats({ accountId: account.accountId });
      if (response?.requiresApproval && response?.url) {
        window.location.href = response.url;
        return;
      }
      setInfo(t("billing.seatsSynced"));
    } catch (err) {
      setError(err?.message || t("common.genericSaveError"));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="module-page">
      <h1>{t("billing.title")}</h1>
      <p>{t("billing.description")}</p>
      <p>{t("billing.priceHint")}</p>
      <p>
        {t("billing.status")}: <strong>{account?.billingStatus || "-"}</strong>
      </p>
      <p>
        {t("billing.trialEndsAt")}: <strong>{formatDateTime(account?.trialEndsAt, language)}</strong>
      </p>
      <p>
        {t("billing.trialDaysLeft")}: <strong>{trialDaysLeft}</strong>
      </p>
      {error && <p className="error-text">{error}</p>}
      {info && <p>{info}</p>}

      <div className="crud-form-actions">
        <button type="button" className="button-link-primary" onClick={handleStartMembership} disabled={isBusy}>
          {t("billing.startMembership")}
        </button>
        <button type="button" className="button-secondary" onClick={handleOpenPortal} disabled={isBusy || !canManagePortal}>
          {t("billing.manageSubscription")}
        </button>
        <button type="button" className="button-secondary" onClick={handleSyncSeats} disabled={isBusy}>
          {t("billing.syncSeats")}
        </button>
      </div>

      <p>{t("billing.paypalManageHint")}</p>
    </div>
  );
}

export default AccountBillingPage;
