import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listAccountPaymentForms } from "../services/accountPaymentFormsService";
import { listConcepts } from "../services/conceptsService";
import { listCurrencies } from "../services/currenciesService";
import { listPaymentMethods } from "../services/paymentMethodsService";
import { createBankDeposit } from "../services/transactionsService";
import { formatPaymentFormLabel } from "../utils/paymentFormLabel";

const initialForm = {
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  currencyId: "",
  fromCashFormId: "",
  toBankFormId: "",
  referenceNumber: "",
  description: ""
};

function BankDepositFormPage({ embedded = false, onCancel, onCreated }) {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [paymentForms, setPaymentForms] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const cashForms = useMemo(() => paymentForms.filter((item) => item.kind === "cashbox"), [paymentForms]);
  const bankForms = useMemo(() => paymentForms.filter((item) => item.kind === "bank_account"), [paymentForms]);

  useEffect(() => {
    if (!account?.accountId) return;
    loadData();
  }, [account?.accountId]);

  const loadData = async () => {
    try {
      const [forms, currencyRows, methods, conceptRows] = await Promise.all([
        listAccountPaymentForms(account.accountId),
        listCurrencies(account.accountId),
        listPaymentMethods(account.accountId),
        listConcepts(account.accountId)
      ]);
      setPaymentForms(forms);
      setCurrencies(currencyRows);
      setPaymentMethods(methods);
      setConcepts(conceptRows);
      const localCurrencyId = currencyRows.find((item) => item.isLocal)?.id;
      setForm((prev) => ({ ...prev, currencyId: prev.currencyId || String(localCurrencyId || "") }));
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      setError(t("common.requiredFields"));
      return;
    }
    if (!account?.accountId || !user?.id || !form.currencyId) {
      setError(t("common.requiredFields"));
      return;
    }
    const amount = Math.abs(Number(form.amount || 0));
    if (!amount || !form.fromCashFormId || !form.toBankFormId) {
      setError(t("common.requiredFields"));
      return;
    }

    const outgoingConcept = concepts.find((item) => item.isOutgoingPaymentConcept);
    const incomingConcept = concepts.find((item) => item.isIncomingPaymentConcept);
    const cashMethod = paymentMethods.find((item) => item.code === "cash");
    const transferMethod = paymentMethods.find((item) => item.code === "bank_transfer");

    if (!outgoingConcept || !incomingConcept || !cashMethod || !transferMethod) {
      setError(t("transactions.missingSystemPaymentConcept"));
      return;
    }

    try {
      setIsSaving(true);
      const created = await createBankDeposit({
        accountId: account.accountId,
        userId: user.id,
        date: form.date,
        amount,
        currencyId: Number(form.currencyId),
        referenceNumber: form.referenceNumber,
        description: form.description,
        cashPaymentMethodId: cashMethod.id,
        transferPaymentMethodId: transferMethod.id,
        fromCashFormId: Number(form.fromCashFormId),
        toBankFormId: Number(form.toBankFormId),
        outgoingConceptId: outgoingConcept.id,
        incomingConceptId: incomingConcept.id
      });
      if (embedded) {
        onCreated?.(created);
      } else {
        navigate("/bank-deposits");
      }
    } catch (err) {
      setError(err?.message || t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={embedded ? "" : "module-page"}>
      {!embedded ? (
        <div className="page-header-row">
          <h1>{t("bankDeposits.title")}</h1>
          <Link to="/bank-deposits" className="button-link-secondary">
            {t("common.backToList")}
          </Link>
        </div>
      ) : (
        <h3>{t("actions.newBankDeposit")}</h3>
      )}
      {error && <p className="error-text">{error}</p>}

      <form className="crud-form" onSubmit={handleSubmit}>
        <div className="form-grid-2">
          <label className="field-block">
            <span>{t("transactions.date")}</span>
            <input type="date" name="date" value={form.date} onChange={handleChange} required />
          </label>
          <label className="field-block">
            <span>{t("transactions.currency")}</span>
            <select name="currencyId" value={form.currencyId} onChange={handleChange} required>
              <option value="">{`-- ${t("transactions.selectCurrency")} --`}</option>
              {currencies.map((currency) => (
                <option key={currency.id} value={currency.id}>
                  {currency.name} ({currency.symbol})
                </option>
              ))}
            </select>
          </label>
          <label className="field-block">
            <span>{t("bankDeposits.fromCash")}</span>
            <select name="fromCashFormId" value={form.fromCashFormId} onChange={handleChange} required>
              <option value="">{`-- ${t("transactions.selectAccountPaymentForm")} --`}</option>
              {cashForms.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatPaymentFormLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-block">
            <span>{t("bankDeposits.toBankAccount")}</span>
            <select name="toBankFormId" value={form.toBankFormId} onChange={handleChange} required>
              <option value="">{`-- ${t("transactions.selectAccountPaymentForm")} --`}</option>
              {bankForms.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatPaymentFormLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-block">
            <span>{t("transactions.amount")}</span>
            <input type="number" min="0" step="0.01" name="amount" value={form.amount} onChange={handleChange} required />
          </label>
          <label className="field-block">
            <span>{t("transactions.referenceNumber")}</span>
            <input name="referenceNumber" value={form.referenceNumber} onChange={handleChange} />
          </label>
          <label className="field-block form-span-2">
            <span>{t("transactions.description")}</span>
            <input name="description" value={form.description} onChange={handleChange} />
          </label>
        </div>

        <div className="crud-form-actions">
          {embedded ? (
            <button type="button" className="button-secondary" onClick={() => onCancel?.()}>
              {t("common.cancel")}
            </button>
          ) : null}
          <button type="submit" disabled={isSaving}>
            {t("common.create")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default BankDepositFormPage;
