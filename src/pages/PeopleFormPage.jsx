import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import TextField from "../components/form/TextField";
import RtnField from "../components/form/RtnField";
import { createPerson, getPersonById, updatePerson } from "../services/personsService";

const initialForm = {
  name: "",
  rtn: "",
  phone: "",
  address: ""
};

function PeopleFormPage({ personType, titleKey, basePath, embedded = false, onCancel, onCreated, itemId = null }) {
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
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setForm(initialForm);
    setError("");
    setLoadFailed(false);
    setIsLoading(isEdit);
    if (isEdit && account?.accountId) loadItem(() => cancelled);
    return () => { cancelled = true; };
  }, [isEdit, currentId, account?.accountId, personType]);

  const loadItem = async (isCancelled = () => false) => {
    try {
      setIsLoading(true);
      const item = await getPersonById(currentId, account.accountId);
      if (Number(item.type) !== Number(personType)) throw new Error("Unexpected person type");
      if (isCancelled()) return;
      setForm({
        name: item.name,
        rtn: item.rtn ?? "",
        phone: item.phone ?? "",
        address: item.address ?? ""
      });
    } catch {
      if (isCancelled()) return;
      setLoadFailed(true);
      setError(t("common.genericLoadError"));
    } finally {
      if (!isCancelled()) setIsLoading(false);
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
    if (!account?.accountId || !user?.id || loadFailed || isLoading) {
      setError(t("common.requiredFields"));
      return;
    }

    const payload = {
      accountId: account.accountId,
      name: form.name.trim(),
      rtn: form.rtn.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      type: personType
    };

    try {
      setIsSaving(true);
      let created = null;
      if (isEdit) {
        created = await updatePerson(currentId, payload);
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
            <TextField
              label={t("common.name")}
              name="name"
              placeholder={t("common.name")}
              value={form.name}
              onChange={handleChange}
              required
            />
            <TextField label={t("common.phone")} name="phone" placeholder={t("common.phone")} value={form.phone} onChange={handleChange} />
            <RtnField value={form.rtn} onChange={handleChange} disabled={isSaving || loadFailed} />
            <TextField
              label={t("common.address")}
              name="address"
              placeholder={t("common.address")}
              value={form.address}
              onChange={handleChange}
              className="form-span-2"
            />
          </div>

          <div className="crud-form-actions">
            {embedded ? (
              <button type="button" className="button-secondary" onClick={() => onCancel?.()}>
                {t("common.cancel")}
              </button>
            ) : null}
            <button type="submit" disabled={isSaving || loadFailed} className={isSaving ? "is-saving" : ""}>
              {isEdit ? t("common.update") : t("common.create")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default PeopleFormPage;
