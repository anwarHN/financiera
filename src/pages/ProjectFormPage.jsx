import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { createProject, getProjectById, updateProject } from "../services/projectsService";

const initialForm = {
  name: "",
  description: "",
  startDate: "",
  endDate: ""
};

function ProjectFormPage() {
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
    if (!account?.accountId || !user?.id) return;

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
      if (isEdit) {
        await updateProject(id, payload);
      } else {
        await createProject({ ...payload, createdById: user.id });
      }
      navigate("/projects");
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="module-page">
      <div className="page-header-row">
        <h1>{isEdit ? t("common.edit") : t("actions.newProject")}</h1>
        <Link to="/projects" className="button-link-secondary">
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
              <input name="name" value={form.name} onChange={handleChange} required />
            </label>
            <label className="field-block">
              <span>{t("transactions.description")}</span>
              <input name="description" value={form.description} onChange={handleChange} />
            </label>
            <label className="field-block">
              <span>{t("projects.startDate")}</span>
              <input type="date" name="startDate" value={form.startDate} onChange={handleChange} />
            </label>
            <label className="field-block">
              <span>{t("projects.endDate")}</span>
              <input type="date" name="endDate" value={form.endDate} onChange={handleChange} />
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

export default ProjectFormPage;
