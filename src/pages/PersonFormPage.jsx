import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { createPerson, getPersonById, updatePerson } from "../services/personsService";
import RtnField from "../components/form/RtnField";

const initialForm = {
  name: "",
  rtn: "",
  phone: "",
  address: "",
  type: 1
};

function PersonFormPage() {
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
    let cancelled = false;
    setForm(initialForm);
    setError("");
    if (isEdit && account?.accountId) loadItem(() => cancelled);
    return () => { cancelled = true; };
  }, [isEdit, id, account?.accountId]);

  const loadItem = async (isCancelled = () => false) => {
    try {
      setIsLoading(true);
      const item = await getPersonById(id, account.accountId);
      if (isCancelled()) return;
      setForm({
        name: item.name,
        rtn: item.rtn ?? "",
        phone: item.phone ?? "",
        address: item.address ?? "",
        type: item.type ?? 1
      });
    } catch {
      if (isCancelled()) return;
      setError(t("common.genericLoadError"));
    } finally {
      if (!isCancelled()) setIsLoading(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "type" ? Number(value) : value
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
      rtn: form.rtn.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      type: form.type
    };

    try {
      setIsSaving(true);
      if (isEdit) {
        await updatePerson(id, payload);
      } else {
        await createPerson({ ...payload, createdById: user.id });
      }
      navigate("/persons");
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
        <Link to="/persons" className="button-link-secondary">
          {t("common.backToList")}
        </Link>
      </div>

      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <form className="crud-form" onSubmit={handleSubmit}>
          <input name="name" placeholder={t("common.name")} value={form.name} onChange={handleChange} required />
          <RtnField value={form.rtn} onChange={handleChange} />
          <input name="phone" placeholder={t("common.phone")} value={form.phone} onChange={handleChange} />
          <input name="address" placeholder={t("common.address")} value={form.address} onChange={handleChange} />
          <select name="type" value={form.type} onChange={handleChange}>
            <option value={1}>{t("persons.client")}</option>
            <option value={2}>{t("persons.supplier")}</option>
          </select>

          <div className="crud-form-actions">
            <button type="submit" disabled={isSaving} className={isSaving ? "is-saving" : ""}>
              {isEdit ? t("common.update") : t("common.create")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default PersonFormPage;
