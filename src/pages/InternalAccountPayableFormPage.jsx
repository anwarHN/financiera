import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import DateField from "../components/form/DateField";
import NumberField from "../components/form/NumberField";
import SelectField from "../components/form/SelectField";
import TextField from "../components/form/TextField";
import { listAccountPaymentForms } from "../services/accountPaymentFormsService";
import { listCurrencies } from "../services/currenciesService";
import { createInternalObligation, getTransactionById, updateInternalObligation } from "../services/transactionsService";
import { formatPaymentFormLabel } from "../utils/paymentFormLabel";

const initialForm = {
  date: new Date().toISOString().slice(0, 10),
  name: "",
  referenceNumber: "",
  accountPaymentFormId: "",
  currencyId: "",
  total: 0
};

function InternalAccountPayableFormPage({ embedded = false, onCancel, onCreated }) {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !embedded && Boolean(id);

  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [paymentForms, setPaymentForms] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [existingPayments, setExistingPayments] = useState(0);

  useEffect(() => {
    if (!account?.accountId) return;
    loadDependencies();
  }, [account?.accountId]);

  useEffect(() => {
    if (!isEdit || !account?.accountId) return;
    loadItem();
  }, [isEdit, id, account?.accountId]);

  const loadDependencies = async () => {
    try {
      const [forms, currencyRows] = await Promise.all([
        listAccountPaymentForms(account.accountId),
        listCurrencies(account.accountId)
      ]);
      setPaymentForms(forms);
      setCurrencies(currencyRows);
      const localCurrencyId = currencyRows.find((item) => item.isLocal)?.id;
      setForm((prev) => ({ ...prev, currencyId: prev.currencyId || (localCurrencyId ? String(localCurrencyId) : "") }));
    } catch {
      setPaymentForms([]);
      setCurrencies([]);
    }
  };

  const loadItem = async () => {
    try {
      setIsLoading(true);
      const item = await getTransactionById(id);
      if (!item.isInternalObligation) {
        throw new Error("Not an internal obligation");
      }
      setForm({
        date: item.date || new Date().toISOString().slice(0, 10),
        name: item.name || "",
        referenceNumber: item.referenceNumber || "",
        accountPaymentFormId: item.accountPaymentFormId ? String(item.accountPaymentFormId) : "",
        currencyId: item.currencyId ? String(item.currencyId) : "",
        total: Number(item.total || 0)
      });
      setExistingPayments(Number(item.payments || 0));
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
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

    const total = Number(form.total || 0);
    if (total <= 0) {
      setError(t("transactions.invalidTransactionAmount"));
      return;
    }
    if (total < existingPayments) {
      setError(t("internalObligations.totalLowerThanPayments"));
      return;
    }

    const payload = {
      accountId: account.accountId,
      date: form.date,
      name: form.name.trim(),
      referenceNumber: form.referenceNumber.trim() || null,
      accountPaymentFormId: form.accountPaymentFormId ? Number(form.accountPaymentFormId) : null,
      currencyId: Number(form.currencyId),
      total,
      payments: existingPayments,
      balance: Math.max(total - existingPayments, 0)
    };

    try {
      setIsSaving(true);
      let created = null;
      if (isEdit) {
        created = await updateInternalObligation(id, payload);
      } else {
        created = await createInternalObligation({ ...payload, userId: user.id });
      }
      if (embedded) {
        onCreated?.(created);
        return;
      }
      navigate("/internal-obligations");
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={embedded ? "" : "module-page"}>
      {!embedded ? (
        <div className="page-header-row">
          <h1>{isEdit ? t("common.edit") : t("actions.newInternalObligation")}</h1>
          <Link to="/internal-obligations" className="button-link-secondary">
            {t("common.backToList")}
          </Link>
        </div>
      ) : (
        <h3>{isEdit ? t("common.edit") : t("actions.newInternalObligation")}</h3>
      )}
      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <form className="crud-form" onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <DateField label={t("transactions.date")} name="date" value={form.date} onChange={handleChange} required />
            <SelectField label={t("transactions.currency")} name="currencyId" value={form.currencyId} onChange={handleChange} required>
                <option value="">{`-- ${t("transactions.selectCurrency")} --`}</option>
                {currencies.map((currency) => (
                  <option key={currency.id} value={currency.id}>
                    {currency.name} ({currency.symbol})
                  </option>
                ))}
            </SelectField>
            <TextField label={t("common.name")} name="name" value={form.name} onChange={handleChange} className="form-span-2" required />
            <SelectField label={t("paymentForms.title")} name="accountPaymentFormId" value={form.accountPaymentFormId} onChange={handleChange}>
                <option value="">{`-- ${t("transactions.selectAccountPaymentForm")} --`}</option>
                {paymentForms.map((item) => (
                  <option key={item.id} value={item.id}>
                    {formatPaymentFormLabel(item)}
                  </option>
                ))}
            </SelectField>
            <TextField label={t("transactions.referenceNumber")} name="referenceNumber" value={form.referenceNumber} onChange={handleChange} />
            <NumberField label={t("transactions.total")} step="0.01" min="0" name="total" value={form.total} onChange={handleChange} required />
          </div>

          <div className="crud-form-actions">
            {embedded ? (
              <button type="button" className="button-secondary" onClick={() => onCancel?.()}>
                {t("common.cancel")}
              </button>
            ) : null}
            <button type="submit" disabled={isSaving}>
              {isEdit ? t("common.update") : t("common.create")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default InternalAccountPayableFormPage;
