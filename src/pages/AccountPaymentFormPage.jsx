import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import {
  createAccountPaymentForm,
  getAccountPaymentFormById,
  updateAccountPaymentForm
} from "../services/accountPaymentFormsService";
import { listEmployees } from "../services/employeesService";

const initialForm = {
  name: "",
  kind: "bank_account",
  provider: "",
  reference: "",
  employeeId: "",
  createInternalPayableOnOutgoingPayment: false
};

function AccountPaymentFormPage({ embedded = false, onCancel, onCreated }) {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !embedded && Boolean(id);

  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    if (account?.accountId) {
      loadEmployees();
    }
  }, [account?.accountId]);

  useEffect(() => {
    if (!isEdit || !account?.accountId) return;
    loadItem();
  }, [isEdit, id, account?.accountId]);

  const loadEmployees = async () => {
    try {
      const data = await listEmployees(account.accountId);
      setEmployees(data);
    } catch {
      setEmployees([]);
    }
  };

  const loadItem = async () => {
    try {
      setIsLoading(true);
      const item = await getAccountPaymentFormById(id);
      setForm({
        name: item.name || "",
        kind: item.kind || "bank_account",
        provider: item.provider || "",
        reference: item.reference || "",
        employeeId: item.employeeId ? String(item.employeeId) : "",
        createInternalPayableOnOutgoingPayment: Boolean(item.createInternalPayableOnOutgoingPayment)
      });
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    if (name === "createInternalPayableOnOutgoingPayment") {
      setForm((prev) => ({ ...prev, createInternalPayableOnOutgoingPayment: event.target.checked }));
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
    if (!account?.accountId || !user?.id) {
      setError(t("common.requiredFields"));
      return;
    }
    const payload = {
      accountId: account.accountId,
      name: form.name.trim(),
      kind: form.kind,
      provider: form.provider.trim() || null,
      reference: form.reference.trim() || null,
      createInternalPayableOnOutgoingPayment: Boolean(form.createInternalPayableOnOutgoingPayment)
    };
    if (form.employeeId) {
      payload.employeeId = Number(form.employeeId);
    }

    try {
      setIsSaving(true);
      let created = null;
      if (isEdit) {
        created = await updateAccountPaymentForm(id, payload);
      } else {
        created = await createAccountPaymentForm({ ...payload, createdById: user.id });
      }
      if (embedded) {
        onCreated?.(created);
        return;
      }
      navigate("/payment-forms");
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
          <h1>{isEdit ? t("common.edit") : t("actions.newPaymentForm")}</h1>
          <Link to="/payment-forms" className="button-link-secondary">
            {t("common.backToList")}
          </Link>
        </div>
      ) : (
        <h3>{isEdit ? t("common.edit") : t("actions.newPaymentForm")}</h3>
      )}
      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <form className="crud-form" onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <label className="field-block">
              <span>{t("common.name")}</span>
              <input name="name" value={form.name} onChange={handleChange} required />
            </label>
            <label className="field-block">
              <span>{t("paymentForms.kind")}</span>
              <select name="kind" value={form.kind} onChange={handleChange} required>
                <option value="bank_account">{t("paymentForms.kinds.bank_account")}</option>
                <option value="credit_card">{t("paymentForms.kinds.credit_card")}</option>
                <option value="cashbox">{t("paymentForms.kinds.cashbox")}</option>
              </select>
            </label>
            <label className="field-block">
              <span>{t("paymentForms.provider")}</span>
              <input name="provider" value={form.provider} onChange={handleChange} />
            </label>
            <label className="field-block">
              <span>{t("paymentForms.reference")}</span>
              <input name="reference" value={form.reference} onChange={handleChange} />
            </label>
            <label className="field-block">
              <span>{t("paymentForms.employee")}</span>
              <select name="employeeId" value={form.employeeId} onChange={handleChange}>
                <option value="">{`-- ${t("transactions.optionalSeller")} --`}</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-field form-span-2">
              <input
                type="checkbox"
                name="createInternalPayableOnOutgoingPayment"
                checked={form.createInternalPayableOnOutgoingPayment}
                onChange={handleChange}
              />
              <span>{t("paymentForms.createInternalPayableOnOutgoingPayment")}</span>
            </label>
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

export default AccountPaymentFormPage;
