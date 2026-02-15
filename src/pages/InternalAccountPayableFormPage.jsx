import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listAccountPaymentForms } from "../services/accountPaymentFormsService";
import { listCurrencies } from "../services/currenciesService";
import { createInternalObligation, getTransactionById, updateInternalObligation } from "../services/transactionsService";

const initialForm = {
  date: new Date().toISOString().slice(0, 10),
  name: "",
  referenceNumber: "",
  accountPaymentFormId: "",
  currencyId: "",
  total: 0
};

function InternalAccountPayableFormPage() {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

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
    if (!account?.accountId || !user?.id || !form.currencyId) return;

    const total = Number(form.total || 0);
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
      if (isEdit) {
        await updateInternalObligation(id, payload);
      } else {
        await createInternalObligation({ ...payload, userId: user.id });
      }
      navigate("/internal-obligations");
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="module-page">
      <div className="page-header-row">
        <h1>{isEdit ? t("common.edit") : t("actions.newInternalObligation")}</h1>
        <Link to="/internal-obligations" className="button-link-secondary">
          {t("common.backToList")}
        </Link>
      </div>
      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <form className="crud-form" onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <label className="field-block">
              <span>{t("transactions.date")}</span>
              <input type="date" name="date" value={form.date} onChange={handleChange} required />
            </label>
            <label className="field-block">
              <span>{t("transactions.currency")}</span>
              <select name="currencyId" value={form.currencyId} onChange={handleChange} required>
                <option value="">{t("transactions.selectCurrency")}</option>
                {currencies.map((currency) => (
                  <option key={currency.id} value={currency.id}>
                    {currency.name} ({currency.symbol})
                  </option>
                ))}
              </select>
            </label>
            <label className="field-block form-span-2">
              <span>{t("common.name")}</span>
              <input name="name" value={form.name} onChange={handleChange} required />
            </label>
            <label className="field-block">
              <span>{t("paymentForms.title")}</span>
              <select name="accountPaymentFormId" value={form.accountPaymentFormId} onChange={handleChange}>
                <option value="">{t("transactions.selectAccountPaymentForm")}</option>
                {paymentForms.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-block">
              <span>{t("transactions.referenceNumber")}</span>
              <input name="referenceNumber" value={form.referenceNumber} onChange={handleChange} />
            </label>
            <label className="field-block">
              <span>{t("transactions.total")}</span>
              <input type="number" step="0.01" min="0" name="total" value={form.total} onChange={handleChange} required />
            </label>
          </div>

          <div className="crud-form-actions">
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
