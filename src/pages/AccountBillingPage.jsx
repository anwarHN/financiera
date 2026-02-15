import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import {
  createBillingSetupSession,
  createCheckoutSession,
  createPortalSession,
  listBillingPaymentMethods,
  setDefaultBillingPaymentMethod
} from "../services/billingService";

function AccountBillingPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [defaultPaymentMethodId, setDefaultPaymentMethodId] = useState(null);

  const trialDaysLeft = useMemo(() => {
    if (!account?.trialEndsAt) return 0;
    const ms = new Date(account.trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }, [account?.trialEndsAt]);

  const canManagePortal = account?.billingStatus === "active" || account?.billingStatus === "past_due";

  useEffect(() => {
    if (!account?.accountId) return;
    loadPaymentMethods();
  }, [account?.accountId]);

  const loadPaymentMethods = async () => {
    if (!account?.accountId) return;
    try {
      const response = await listBillingPaymentMethods({ accountId: account.accountId });
      setPaymentMethods(response.methods ?? []);
      setDefaultPaymentMethodId(response.defaultPaymentMethodId ?? null);
    } catch (err) {
      setError(err?.message || t("common.genericLoadError"));
    }
  };

  const handleStartMembership = async () => {
    if (!account?.accountId) return;
    try {
      setIsBusy(true);
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

  const handleAddPaymentMethod = async () => {
    if (!account?.accountId) return;
    try {
      setIsBusy(true);
      const response = await createBillingSetupSession({
        accountId: account.accountId,
        appUrl: window.location.origin
      });
      window.location.href = response.url;
    } catch (err) {
      setError(err?.message || t("common.genericLoadError"));
      setIsBusy(false);
    }
  };

  const handleSetDefault = async (paymentMethodId) => {
    if (!account?.accountId || !paymentMethodId) return;
    try {
      setIsBusy(true);
      await setDefaultBillingPaymentMethod({
        accountId: account.accountId,
        paymentMethodId
      });
      await loadPaymentMethods();
      setError("");
    } catch (err) {
      setError(err?.message || t("common.genericSaveError"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleOpenPortal = async () => {
    if (!account?.accountId) return;
    try {
      setIsBusy(true);
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

  return (
    <div className="module-page">
      <h1>{t("billing.title")}</h1>
      <p>{t("billing.description")}</p>
      <p>{t("billing.priceHint")}</p>
      <p>
        {t("billing.status")}: <strong>{account?.billingStatus || "-"}</strong>
      </p>
      <p>
        {t("billing.trialEndsAt")}: <strong>{account?.trialEndsAt ? new Date(account.trialEndsAt).toLocaleString() : "-"}</strong>
      </p>
      <p>
        {t("billing.trialDaysLeft")}: <strong>{trialDaysLeft}</strong>
      </p>
      {error && <p className="error-text">{error}</p>}

      <div className="crud-form-actions">
        <button type="button" className="button-link-primary" onClick={handleStartMembership} disabled={isBusy}>
          {t("billing.startMembership")}
        </button>
        <button type="button" className="button-secondary" onClick={handleOpenPortal} disabled={isBusy || !canManagePortal}>
          {t("billing.manageSubscription")}
        </button>
        <button type="button" className="button-secondary" onClick={handleAddPaymentMethod} disabled={isBusy}>
          {t("billing.addPaymentMethod")}
        </button>
      </div>

      <table className="crud-table">
        <thead>
          <tr>
            <th>{t("billing.cardBrand")}</th>
            <th>{t("billing.cardLast4")}</th>
            <th>{t("billing.cardExpiry")}</th>
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {paymentMethods.length === 0 ? (
            <tr>
              <td colSpan={4}>{t("common.empty")}</td>
            </tr>
          ) : (
            paymentMethods.map((method) => (
              <tr key={method.id}>
                <td>{method.brand}</td>
                <td>**** {method.last4}</td>
                <td>
                  {method.expMonth}/{method.expYear}
                </td>
                <td>
                  {defaultPaymentMethodId === method.id ? (
                    <span>{t("billing.defaultMethod")}</span>
                  ) : (
                    <button type="button" className="button-secondary" onClick={() => handleSetDefault(method.id)} disabled={isBusy}>
                      {t("billing.setDefaultMethod")}
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default AccountBillingPage;
