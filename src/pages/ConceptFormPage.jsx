import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { createConcept, getConceptById, updateConcept } from "../services/conceptsService";

const initialForm = {
  name: "",
  parentConceptId: "",
  isGroup: false,
  isIncome: false,
  isExpense: false,
  isProduct: false,
  isPaymentForm: false,
  taxPercentage: 0
};

function ConceptFormPage() {
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
      const item = await getConceptById(id);
      setForm({
        name: item.name,
        parentConceptId: item.parentConceptId ? String(item.parentConceptId) : "",
        isGroup: Boolean(item.isGroup),
        isIncome: Boolean(item.isIncome),
        isExpense: Boolean(item.isExpense),
        isProduct: Boolean(item.isProduct),
        isPaymentForm: Boolean(item.isPaymentForm),
        taxPercentage: item.taxPercentage ?? 0
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
    if (!account?.accountId || !user?.id) {
      return;
    }

    const payload = {
      accountId: account.accountId,
      name: form.name.trim(),
      parentConceptId: form.parentConceptId ? Number(form.parentConceptId) : null,
      isGroup: form.isGroup,
      isIncome: form.isIncome,
      isExpense: form.isExpense,
      isProduct: form.isProduct,
      isPaymentForm: form.isPaymentForm,
      taxPercentage: Number(form.taxPercentage) || 0
    };

    try {
      setIsSaving(true);
      if (isEdit) {
        await updateConcept(id, payload);
      } else {
        await createConcept({ ...payload, createdById: user.id });
      }
      navigate("/concepts");
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
        <Link to="/concepts" className="button-link-secondary">
          {t("common.backToList")}
        </Link>
      </div>

      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <form className="crud-form" onSubmit={handleSubmit}>
          <input name="name" placeholder={t("common.name")} value={form.name} onChange={handleChange} required />
          <input
            name="parentConceptId"
            type="number"
            min="1"
            placeholder={t("concepts.parentConceptId")}
            value={form.parentConceptId}
            onChange={handleChange}
          />
          <input
            name="taxPercentage"
            type="number"
            min="0"
            step="0.01"
            placeholder={t("concepts.taxPercentage")}
            value={form.taxPercentage}
            onChange={handleChange}
            required
          />

          <label className="checkbox-field">
            <input name="isGroup" type="checkbox" checked={form.isGroup} onChange={handleChange} />
            {t("concepts.isGroup")}
          </label>
          <label className="checkbox-field">
            <input name="isIncome" type="checkbox" checked={form.isIncome} onChange={handleChange} />
            {t("concepts.isIncome")}
          </label>
          <label className="checkbox-field">
            <input name="isExpense" type="checkbox" checked={form.isExpense} onChange={handleChange} />
            {t("concepts.isExpense")}
          </label>
          <label className="checkbox-field">
            <input name="isProduct" type="checkbox" checked={form.isProduct} onChange={handleChange} />
            {t("concepts.isProduct")}
          </label>
          <label className="checkbox-field">
            <input name="isPaymentForm" type="checkbox" checked={form.isPaymentForm} onChange={handleChange} />
            {t("concepts.isPaymentForm")}
          </label>

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

export default ConceptFormPage;
