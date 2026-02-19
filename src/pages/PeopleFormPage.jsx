import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { createPerson, getPersonById, updatePerson } from "../services/personsService";

const initialForm = {
  name: "",
  phone: "",
  address: ""
};

function PeopleFormPage({ personType, titleKey, basePath, embedded = false, onCancel, onCreated }) {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !embedded && Boolean(id);

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
        address: item.address ?? ""
      });
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
    if (!account?.accountId || !user?.id) {
      setError(t("common.requiredFields"));
      return;
    }

    const payload = {
      accountId: account.accountId,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      type: personType
    };

    try {
      setIsSaving(true);
      let created = null;
      if (isEdit) {
        created = await updatePerson(id, payload);
      } else {
        created = await createPerson({ ...payload, createdById: user.id });
      }
      if (embedded) {
        onCreated?.(created);
        return;
      }
      navigate(basePath);
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
          <h1>{isEdit ? t("common.edit") : t(titleKey)}</h1>
          <Link to={basePath} className="button-link-secondary">
            {t("common.backToList")}
          </Link>
        </div>
      ) : (
        <h3>{isEdit ? t("common.edit") : t(titleKey)}</h3>
      )}

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
            <label className="field-block form-span-2">
              <span>{t("common.address")}</span>
              <input name="address" placeholder={t("common.address")} value={form.address} onChange={handleChange} />
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

export default PeopleFormPage;
