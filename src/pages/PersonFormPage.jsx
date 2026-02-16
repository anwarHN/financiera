import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { createPerson, getPersonById, updatePerson } from "../services/personsService";

const initialForm = {
  name: "",
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
    if (!isEdit) {
      return;
    }

    loadItem();
  }, [isEdit, id]);

  const loadItem = async () => {
    try {
      setIsLoading(true);
      const item = await getPersonById(id);
      setForm({
        name: item.name,
        phone: item.phone ?? "",
        address: item.address ?? "",
        type: item.type ?? 1
      });
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
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
          <input name="phone" placeholder={t("common.phone")} value={form.phone} onChange={handleChange} />
          <input name="address" placeholder={t("common.address")} value={form.address} onChange={handleChange} />
          <select name="type" value={form.type} onChange={handleChange}>
            <option value={1}>{t("persons.client")}</option>
            <option value={2}>{t("persons.supplier")}</option>
          </select>

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

export default PersonFormPage;
