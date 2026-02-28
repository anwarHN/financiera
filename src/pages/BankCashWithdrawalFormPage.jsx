import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import LookupCombobox from "../components/LookupCombobox";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import CashboxFormPage from "./CashboxFormPage";
import DateField from "../components/form/DateField";
import NumberField from "../components/form/NumberField";
import SelectField from "../components/form/SelectField";
import TextField from "../components/form/TextField";
import { listAccountPaymentForms } from "../services/accountPaymentFormsService";
import { listConcepts } from "../services/conceptsService";
import { listCurrencies } from "../services/currenciesService";
import { listPaymentMethods } from "../services/paymentMethodsService";
import { createCashWithdrawal } from "../services/transactionsService";
import { formatPaymentFormLabel } from "../utils/paymentFormLabel";

const initialForm = {
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  currencyId: "",
  fromBankFormId: "",
  toCashFormId: "",
  referenceNumber: "",
  description: ""
};

function BankCashWithdrawalFormPage({ embedded = false, onCancel, onCreated }) {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [paymentForms, setPaymentForms] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [cashboxLookup, setCashboxLookup] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const bankForms = useMemo(() => paymentForms.filter((item) => item.kind === "bank_account"), [paymentForms]);
  const cashForms = useMemo(() => paymentForms.filter((item) => item.kind === "cashbox"), [paymentForms]);

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
    if (!amount || !form.fromBankFormId) {
      setError(t("common.requiredFields"));
      return;
    }
    if (form.toCashFormId && Number(form.fromBankFormId) === Number(form.toCashFormId)) {
      setError(t("bankCashWithdrawals.sameAccountError"));
      return;
    }

    const cashWithdrawalConcept =
      concepts.find((item) => item.isCashWithdrawalConcept) ||
      concepts.find((item) => item.isSystem && item.name === "Retiro de efectivo");
    const transferMethod = paymentMethods.find((item) => item.code === "bank_transfer");
    const cashMethod = paymentMethods.find((item) => item.code === "cash");

    if (!cashWithdrawalConcept || !transferMethod || !cashMethod) {
      setError(t("transactions.missingSystemPaymentConcept"));
      return;
    }

    const fromBank = bankForms.find((item) => item.id === Number(form.fromBankFormId));
    const toCash = cashForms.find((item) => item.id === Number(form.toCashFormId));
    try {
      setIsSaving(true);
      const created = await createCashWithdrawal({
        accountId: account.accountId,
        userId: user.id,
        date: form.date,
        amount,
        currencyId: Number(form.currencyId),
        referenceNumber: form.referenceNumber,
        description: form.description,
        transferPaymentMethodId: transferMethod.id,
        cashPaymentMethodId: cashMethod.id,
        fromBankFormId: Number(form.fromBankFormId),
        toCashFormId: form.toCashFormId ? Number(form.toCashFormId) : null,
        fromBankLabel: fromBank ? formatPaymentFormLabel(fromBank) : null,
        toCashLabel: toCash ? formatPaymentFormLabel(toCash) : null,
        cashWithdrawalConceptId: cashWithdrawalConcept.id
      });
      if (embedded) {
        onCreated?.(created);
      } else {
        navigate("/bank-cash-withdrawals");
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
          <h1>{t("bankCashWithdrawals.title")}</h1>
          <Link to="/bank-cash-withdrawals" className="button-link-secondary">
            {t("common.backToList")}
          </Link>
        </div>
      ) : (
        <h3>{t("actions.newCashWithdrawal")}</h3>
      )}
      {error && <p className="error-text">{error}</p>}

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
          <SelectField label={t("bankCashWithdrawals.fromBankAccount")} name="fromBankFormId" value={form.fromBankFormId} onChange={handleChange} required>
            <option value="">{`-- ${t("transactions.selectAccountPaymentForm")} --`}</option>
            {bankForms.map((item) => (
              <option key={item.id} value={item.id}>
                {formatPaymentFormLabel(item)}
              </option>
            ))}
          </SelectField>
          <LookupCombobox
            label={t("bankCashWithdrawals.toCash")}
            value={cashboxLookup}
            onValueChange={setCashboxLookup}
            options={cashForms}
            getOptionLabel={(item) => formatPaymentFormLabel(item)}
            onSelect={(item) => {
              setForm((prev) => ({ ...prev, toCashFormId: String(item.id) }));
              setCashboxLookup("");
            }}
            placeholder={`-- ${t("transactions.selectAccountPaymentForm")} --`}
            noResultsText={t("common.empty")}
            selectedPillText={
              cashForms.find((item) => item.id === Number(form.toCashFormId))
                ? formatPaymentFormLabel(cashForms.find((item) => item.id === Number(form.toCashFormId)))
                : ""
            }
            onClearSelection={() => {
              setForm((prev) => ({ ...prev, toCashFormId: "" }));
              setCashboxLookup("");
            }}
            onCreateRecord={async (created) => {
              const updated = await listAccountPaymentForms(account.accountId);
              setPaymentForms(updated);
              setForm((prev) => ({ ...prev, toCashFormId: String(created.id) }));
              setCashboxLookup("");
            }}
            renderCreateModal={({ isOpen, onClose, onCreated }) =>
              isOpen ? (
                <div className="modal-backdrop">
                  <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                    <CashboxFormPage embedded onCancel={onClose} onCreated={onCreated} />
                  </div>
                </div>
              ) : null
            }
          />
          <NumberField label={t("transactions.amount")} min="0" step="0.01" name="amount" value={form.amount} onChange={handleChange} required />
          <TextField label={t("transactions.referenceNumber")} name="referenceNumber" value={form.referenceNumber} onChange={handleChange} />
          <TextField label={t("transactions.description")} name="description" value={form.description} onChange={handleChange} className="form-span-2" />
        </div>

        <div className="crud-form-actions">
          {embedded ? (
            <button type="button" className="button-secondary" onClick={() => onCancel?.()}>
              {t("common.cancel")}
            </button>
          ) : null}
          <button type="submit" disabled={isSaving} className={isSaving ? "is-saving" : ""}>
            {t("common.create")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default BankCashWithdrawalFormPage;
