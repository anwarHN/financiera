import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { createEmployee, getEmployeeById, updateEmployee } from "../services/employeesService";

const initialForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  isPartner: false
};

function EmployeeFormPage() {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isEdit) {
      return;
    }

    loadItem();
  }, [isEdit, id]);

  const loadItem = async () => {
    try {
      setIsLoading(true);
      const item = await getEmployeeById(id);
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
      if (isEdit) {
        await updateEmployee(id, payload);
      } else {
        await createEmployee({ ...payload, createdById: user.id });
      }
      navigate("/employees");
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="module-page">
      <div className="page-header-row">
        <h1>{isEdit ? t("common.edit") : t("common.create")}</h1>
        <Link to="/employees" className="button-link-secondary">
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
              <span>{t("common.name")}</span>
              <input name="name" placeholder={t("common.name")} value={form.name} onChange={handleChange} required />
            </label>
            <label className="field-block">
              <span>{t("common.phone")}</span>
              <input name="phone" placeholder={t("common.phone")} value={form.phone} onChange={handleChange} />
            </label>
            <label className="field-block">
              <span>{t("common.email")}</span>
              <input name="email" placeholder={t("common.email")} value={form.email} onChange={handleChange} />
            </label>
            <label className="field-block">
              <span>{t("common.address")}</span>
              <input name="address" placeholder={t("common.address")} value={form.address} onChange={handleChange} />
            </label>
            <label className="checkbox-field form-span-2">
              <input name="isPartner" type="checkbox" checked={form.isPartner} onChange={handleChange} />
              {t("employees.isPartner")}
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

export default EmployeeFormPage;
