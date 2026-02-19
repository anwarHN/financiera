import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import TextField from "../components/form/TextField";
import { createEmployee, getEmployeeById, updateEmployee } from "../services/employeesService";

const initialForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  isPartner: false
};

function EmployeeFormPage({ embedded = false, onCancel, onCreated, itemId = null }) {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const currentId = embedded ? itemId : id;
  const isEdit = Boolean(currentId);

  const [form, setForm] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isEdit) {
      return;
    }

    loadItem();
  }, [isEdit, currentId]);

  const loadItem = async () => {
    try {
      setIsLoading(true);
      const item = await getEmployeeById(currentId);
      setForm({
        name: item.name,
        phone: item.phone ?? "",
        email: item.email ?? "",
        address: item.address ?? "",
        isPartner: Boolean(item.isPartner)
      });
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
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
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      isPartner: form.isPartner
    };

    try {
      setIsSaving(true);
      let created = null;
      if (isEdit) {
        created = await updateEmployee(currentId, payload);
      } else {
        created = await createEmployee({ ...payload, createdById: user.id });
      }
      if (embedded) {
        onCreated?.(created);
        return;
      }
      navigate("/employees");
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
          <h1>{isEdit ? t("common.edit") : t("common.create")}</h1>
          <Link to="/employees" className="button-link-secondary">
            {t("common.backToList")}
          </Link>
        </div>
      ) : (
        <h3>{isEdit ? t("common.edit") : t("actions.newEmployee")}</h3>
      )}

      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <form className="crud-form" onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <TextField
              label={t("common.name")}
              name="name"
              placeholder={t("common.name")}
              value={form.name}
              onChange={handleChange}
              required
            />
            <TextField label={t("common.phone")} name="phone" placeholder={t("common.phone")} value={form.phone} onChange={handleChange} />
            <TextField label={t("common.email")} name="email" placeholder={t("common.email")} value={form.email} onChange={handleChange} />
            <TextField label={t("common.address")} name="address" placeholder={t("common.address")} value={form.address} onChange={handleChange} />
            <label className="checkbox-field form-span-2">
              <input name="isPartner" type="checkbox" checked={form.isPartner} onChange={handleChange} />
              {t("employees.isPartner")}
            </label>
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

export default EmployeeFormPage;
