import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DateField from "../components/form/DateField";
import NumberField from "../components/form/NumberField";
import SelectField from "../components/form/SelectField";
import TextField from "../components/form/TextField";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listAccountPaymentForms } from "../services/accountPaymentFormsService";
import { listCurrencies } from "../services/currenciesService";
import { listEmployees } from "../services/employeesService";
import { listPaymentMethods } from "../services/paymentMethodsService";
import {
  createEmployeeLoan,
  getEmployeeLoanDisbursementBySourceId,
  getTransactionById,
  updateEmployeeLoan
} from "../services/transactionsService";
import { formatPaymentFormLabel } from "../utils/paymentFormLabel";

const initialForm = {
  date: new Date().toISOString().slice(0, 10),
  name: "",
  referenceNumber: "",
  employeeId: "",
  paymentMethodId: "",
  accountPaymentFormId: "",
  currencyId: "",
  total: 0
};

function EmployeeLoanFormPage({ embedded = false, itemId = null, onCancel, onCreated }) {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const editId = embedded ? itemId : params.id;
  const isEdit = Boolean(editId);

  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [accountPaymentForms, setAccountPaymentForms] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [existingPayments, setExistingPayments] = useState(0);

  const selectedPaymentMethod = useMemo(
    () => paymentMethods.find((method) => method.id === Number(form.paymentMethodId)) ?? null,
    [paymentMethods, form.paymentMethodId]
  );
  const requiresAccountPaymentForm = selectedPaymentMethod?.code === "card" || selectedPaymentMethod?.code === "bank_transfer";
  const filteredAccountPaymentForms = useMemo(() => {
    if (!selectedPaymentMethod) return accountPaymentForms;
    if (selectedPaymentMethod.code === "card") return accountPaymentForms.filter((item) => item.kind === "credit_card");
    if (selectedPaymentMethod.code === "bank_transfer") return accountPaymentForms.filter((item) => item.kind === "bank_account");
    if (selectedPaymentMethod.code === "cash") return accountPaymentForms.filter((item) => item.kind === "cashbox");
    return accountPaymentForms;
  }, [accountPaymentForms, selectedPaymentMethod]);

  useEffect(() => {
    if (!account?.accountId) return;
    loadDependencies();
  }, [account?.accountId]);

  useEffect(() => {
    if (!isEdit || !account?.accountId) return;
    loadItem();
  }, [isEdit, editId, account?.accountId]);

  const loadDependencies = async () => {
    try {
      const [employeesRows, methodsRows, formsRows, currenciesRows] = await Promise.all([
        listEmployees(account.accountId),
        listPaymentMethods(account.accountId),
        listAccountPaymentForms(account.accountId),
        listCurrencies(account.accountId)
      ]);
      setEmployees(employeesRows.filter((item) => item.isActive !== false));
      setPaymentMethods(methodsRows);
      setAccountPaymentForms(formsRows);
      setCurrencies(currenciesRows);
      const localCurrencyId = currenciesRows.find((item) => item.isLocal)?.id;
      setForm((prev) => ({ ...prev, currencyId: prev.currencyId || (localCurrencyId ? String(localCurrencyId) : "") }));
    } catch {
      setError(t("common.genericLoadError"));
    }
  };

  const loadItem = async () => {
    try {
      setIsLoading(true);
      const tx = await getTransactionById(editId);
      if (!tx.isEmployeeLoan || tx.sourceTransactionId) throw new Error("Not employee loan");

      const disbursement = await getEmployeeLoanDisbursementBySourceId(tx.id);
      setForm({
        date: tx.date || initialForm.date,
        name: tx.name || "",
        referenceNumber: tx.referenceNumber || "",
        employeeId: tx.employeeId ? String(tx.employeeId) : "",
        paymentMethodId: disbursement?.paymentMethodId ? String(disbursement.paymentMethodId) : "",
        accountPaymentFormId: disbursement?.accountPaymentFormId ? String(disbursement.accountPaymentFormId) : "",
        currencyId: tx.currencyId ? String(tx.currencyId) : "",
        total: Math.abs(Number(tx.total || 0))
      });
      setExistingPayments(Math.abs(Number(tx.payments || 0)));
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    if (name === "paymentMethodId") {
      setForm((prev) => ({ ...prev, paymentMethodId: value, accountPaymentFormId: "" }));
      return;
    }
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
    if (!account?.accountId || !user?.id || !form.employeeId || !form.currencyId || !form.paymentMethodId) {
      setError(t("common.requiredFields"));
      return;
    }
    if (requiresAccountPaymentForm && !form.accountPaymentFormId) {
      setError(t("transactions.accountPaymentFormRequired"));
      return;
    }

    const total = Math.abs(Number(form.total || 0));
    if (total <= 0) {
      setError(t("transactions.invalidTransactionAmount"));
      return;
    }
    if (total < existingPayments) {
      setError(t("internalObligations.totalLowerThanPayments"));
      return;
    }

    const payload = {
      date: form.date,
      name: form.name.trim() || t("employeeLoans.loanNameDefault"),
      referenceNumber: form.referenceNumber.trim() || null,
      employeeId: Number(form.employeeId),
      paymentMethodId: Number(form.paymentMethodId),
      accountPaymentFormId: form.accountPaymentFormId ? Number(form.accountPaymentFormId) : null,
      currencyId: Number(form.currencyId),
      total
    };

    try {
      setIsSaving(true);
      let saved;
      if (isEdit) {
        saved = await updateEmployeeLoan(Number(editId), payload);
      } else {
        saved = await createEmployeeLoan({
          accountId: account.accountId,
          userId: user.id,
          ...payload
        });
      }
      if (embedded) {
        onCreated?.(saved);
      } else {
        navigate("/employee-loans");
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
          <h1>{isEdit ? t("common.edit") : t("actions.newEmployeeLoan")}</h1>
          <Link to="/employee-loans" className="button-link-secondary">
            {t("common.backToList")}
          </Link>
        </div>
      ) : (
        <h3>{isEdit ? t("common.edit") : t("actions.newEmployeeLoan")}</h3>
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
            <SelectField label={t("transactions.employee")} name="employeeId" value={form.employeeId} onChange={handleChange} required>
              <option value="">{`-- ${t("transactions.employee")} --`}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </SelectField>
            <NumberField label={t("transactions.amount")} step="0.01" min="0" name="total" value={form.total} onChange={handleChange} required />
            <SelectField label={t("transactions.paymentMethod")} name="paymentMethodId" value={form.paymentMethodId} onChange={handleChange} required>
              <option value="">{`-- ${t("transactions.selectPaymentMethod")} --`}</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t("transactions.accountPaymentForm")}
              name="accountPaymentFormId"
              value={form.accountPaymentFormId}
              onChange={handleChange}
              required={requiresAccountPaymentForm}
            >
              <option value="">{`-- ${t("transactions.selectAccountPaymentForm")} --`}</option>
              {filteredAccountPaymentForms.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatPaymentFormLabel(item)}
                </option>
              ))}
            </SelectField>
            <TextField label={t("transactions.referenceNumber")} name="referenceNumber" value={form.referenceNumber} onChange={handleChange} />
            <TextField label={t("transactions.description")} name="name" value={form.name} onChange={handleChange} className="form-span-2" />
          </div>
          <div className="crud-form-actions">
            {embedded ? (
              <button type="button" className="button-secondary" onClick={() => onCancel?.()}>
                {t("common.cancel")}
              </button>
            ) : null}
            <button type="submit" disabled={isSaving} className={isSaving ? "is-saving" : ""}>
              {isEdit ? t("common.update") : t("common.create")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default EmployeeLoanFormPage;
