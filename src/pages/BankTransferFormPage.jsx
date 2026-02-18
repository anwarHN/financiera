import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listAccountPaymentForms } from "../services/accountPaymentFormsService";
import { listConcepts } from "../services/conceptsService";
import { listCurrencies } from "../services/currenciesService";
import { listPaymentMethods } from "../services/paymentMethodsService";
import { createBankTransfer } from "../services/transactionsService";
import { formatPaymentFormLabel } from "../utils/paymentFormLabel";

const initialForm = {
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  currencyId: "",
  fromBankFormId: "",
  toBankFormId: "",
  referenceNumber: "",
  description: ""
};

function BankTransferFormPage() {
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
    if (!amount || !form.fromBankFormId || !form.toBankFormId) {
      setError(t("common.requiredFields"));
      return;
    }
    if (Number(form.fromBankFormId) === Number(form.toBankFormId)) {
      setError(t("bankTransfers.sameAccountError"));
      return;
    }

    const outgoingConcept = concepts.find((item) => item.isOutgoingPaymentConcept);
    const incomingConcept = concepts.find((item) => item.isIncomingPaymentConcept);
    const transferMethod = paymentMethods.find((item) => item.code === "bank_transfer");

    if (!outgoingConcept || !incomingConcept || !transferMethod) {
      setError(t("transactions.missingSystemPaymentConcept"));
      return;
    }

    const fromBank = bankForms.find((item) => item.id === Number(form.fromBankFormId));
    const toBank = bankForms.find((item) => item.id === Number(form.toBankFormId));

    try {
      setIsSaving(true);
      await createBankTransfer({
        accountId: account.accountId,
        userId: user.id,
        date: form.date,
        amount,
        currencyId: Number(form.currencyId),
        referenceNumber: form.referenceNumber,
        description: form.description,
        transferPaymentMethodId: transferMethod.id,
        fromBankFormId: Number(form.fromBankFormId),
        toBankFormId: Number(form.toBankFormId),
        fromBankLabel: fromBank ? formatPaymentFormLabel(fromBank) : null,
        toBankLabel: toBank ? formatPaymentFormLabel(toBank) : null,
        outgoingConceptId: outgoingConcept.id,
        incomingConceptId: incomingConcept.id
      });
      navigate("/bank-transfers");
    } catch (err) {
      setError(err?.message || t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="module-page">
      <div className="page-header-row">
        <h1>{t("bankTransfers.title")}</h1>
        <Link to="/bank-transfers" className="button-link-secondary">
          {t("common.backToList")}
        </Link>
      </div>
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
            <span>{t("bankTransfers.fromBankAccount")}</span>
            <select name="fromBankFormId" value={form.fromBankFormId} onChange={handleChange} required>
              <option value="">{`-- ${t("transactions.selectAccountPaymentForm")} --`}</option>
              {bankForms.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatPaymentFormLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-block">
            <span>{t("bankTransfers.toBankAccount")}</span>
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
          <button type="submit" disabled={isSaving}>
            {t("common.create")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default BankTransferFormPage;
