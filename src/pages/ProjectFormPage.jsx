import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import DateField from "../components/form/DateField";
import TextField from "../components/form/TextField";
import { createProject, getProjectById, updateProject } from "../services/projectsService";

const initialForm = {
  name: "",
  description: "",
  startDate: "",
  endDate: ""
};

function ProjectFormPage({ embedded = false, onCancel, onCreated }) {
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
    if (!isEdit) return;
    loadItem();
  }, [isEdit, id]);

  const loadItem = async () => {
    try {
      setIsLoading(true);
      const item = await getProjectById(id);
      setForm({
        name: item.name || "",
        description: item.description || "",
        startDate: item.startDate || "",
        endDate: item.endDate || ""
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
      description: form.description.trim() || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      isActive: true
    };

    try {
      setIsSaving(true);
      let created = null;
      if (isEdit) {
        created = await updateProject(id, payload);
      } else {
        created = await createProject({ ...payload, createdById: user.id });
      }
      if (embedded) {
        onCreated?.(created);
        return;
      }
      navigate("/projects");
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
          <h1>{isEdit ? t("common.edit") : t("actions.newProject")}</h1>
          <Link to="/projects" className="button-link-secondary">
            {t("common.backToList")}
          </Link>
        </div>
      ) : (
        <h3>{isEdit ? t("common.edit") : t("actions.newProject")}</h3>
      )}
      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <form className="crud-form" onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <TextField label={t("common.name")} name="name" value={form.name} onChange={handleChange} required />
            <TextField label={t("transactions.description")} name="description" value={form.description} onChange={handleChange} />
            <DateField label={t("projects.startDate")} name="startDate" value={form.startDate} onChange={handleChange} />
            <DateField label={t("projects.endDate")} name="endDate" value={form.endDate} onChange={handleChange} />
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

export default ProjectFormPage;
