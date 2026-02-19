import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import LookupCombobox from "../components/LookupCombobox";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { createConcept, getConceptById, listConceptsByModule, updateConcept } from "../services/conceptsService";

const moduleFlags = {
  products: { isProduct: true, isIncome: true, isExpense: false, isGroup: false, isPaymentForm: false, isAccountPayableConcept: false },
  income: {
    isProduct: false,
    isIncome: true,
    isExpense: false,
    isGroup: false,
    isPaymentForm: false,
    isAccountPayableConcept: false
  },
  expense: {
    isProduct: false,
    isIncome: false,
    isExpense: true,
    isGroup: false,
    isPaymentForm: false,
    isAccountPayableConcept: false
  },
  payable: { isProduct: false, isIncome: false, isExpense: true, isGroup: false, isPaymentForm: false, isAccountPayableConcept: true },
  groups: { isProduct: false, isIncome: false, isExpense: false, isGroup: true, isPaymentForm: false, isAccountPayableConcept: false }
};

const initialForm = {
  name: "",
  parentConceptId: "",
  taxPercentage: 0,
  price: 0,
  additionalCharges: 0,
  groupType: "income"
};

function ConceptModuleFormPage({ moduleType, titleKey, basePath, embedded = false, onCancel, onCreated }) {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !embedded && Boolean(id);

  const [form, setForm] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [error, setError] = useState("");
  const [groupOptions, setGroupOptions] = useState([]);
  const [groupLookup, setGroupLookup] = useState("");

  useEffect(() => {
    if (!account?.accountId) {
      return;
    }
    loadGroups();
  }, [account?.accountId]);

  useEffect(() => {
    if (!isEdit || !account?.accountId) {
      return;
    }
    loadItem();
  }, [isEdit, id, account?.accountId]);

  const loadGroups = async () => {
    try {
      const groups = await listConceptsByModule(account.accountId, "groups");
      setGroupOptions(groups);
    } catch {
      setGroupOptions([]);
    }
  };

  const loadItem = async () => {
    try {
      setIsLoading(true);
      const item = await getConceptById(id);
      setForm({
        name: item.name,
        parentConceptId: item.parentConceptId ? String(item.parentConceptId) : "",
        taxPercentage: item.taxPercentage ?? 0,
        price: item.price ?? 0,
        additionalCharges: item.additionalCharges ?? 0,
        groupType: item.isExpense ? "expense" : "income"
      });
      const selectedGroup = item.parentConceptId ? groupOptions.find((g) => g.id === Number(item.parentConceptId)) : null;
      setGroupLookup(selectedGroup?.name || "");
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
      [name]: value
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
    if (["income", "expense", "payable"].includes(moduleType) && !form.parentConceptId) {
      setError(t("common.requiredFields"));
      return;
    }

    const payload = {
      accountId: account.accountId,
      name: form.name.trim(),
      parentConceptId: moduleType === "groups" ? null : form.parentConceptId ? Number(form.parentConceptId) : null,
      taxPercentage: moduleType === "products" ? Number(form.taxPercentage) || 0 : 0,
      price: Number(form.price) || 0,
      additionalCharges: Number(form.additionalCharges) || 0,
      ...moduleFlags[moduleType]
    };

    if (moduleType === "groups") {
      payload.isIncome = form.groupType === "income";
      payload.isExpense = form.groupType === "expense";
    }

    try {
      setIsSaving(true);
      let created = null;
      if (isEdit) {
        created = await updateConcept(id, payload);
      } else {
        created = await createConcept({ ...payload, createdById: user.id });
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

            {moduleType !== "groups" ? (
              ["income", "expense", "payable"].includes(moduleType) ? (
                <LookupCombobox
                  label={t("concepts.group")}
                  value={groupLookup}
                  onValueChange={setGroupLookup}
                  options={groupOptions}
                  getOptionLabel={(group) => group.name || ""}
                  onSelect={(group) => {
                    setForm((prev) => ({ ...prev, parentConceptId: String(group.id) }));
                    setGroupLookup("");
                  }}
                  placeholder={`-- ${t("concepts.group")} --`}
                  noResultsText={t("common.empty")}
                  selectedPillText={groupOptions.find((g) => g.id === Number(form.parentConceptId))?.name || ""}
                  onClearSelection={() => {
                    setForm((prev) => ({ ...prev, parentConceptId: "" }));
                    setGroupLookup("");
                  }}
                  renderCreateModal={({ isOpen, onClose, onCreated }) =>
                    isOpen ? (
                      <div className="modal-backdrop" onClick={onClose}>
                        <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                          <ConceptModuleFormPage
                            embedded
                            moduleType="groups"
                            titleKey="actions.newConceptGroup"
                            basePath="/concept-groups"
                            onCancel={onClose}
                            onCreated={onCreated}
                          />
                        </div>
                      </div>
                    ) : null
                  }
                  onCreateRecord={async (createdGroup) => {
                    const groups = await listConceptsByModule(account.accountId, "groups");
                    setGroupOptions(groups);
                    setForm((prev) => ({ ...prev, parentConceptId: String(createdGroup.id) }));
                    setGroupLookup("");
                  }}
                />
              ) : (
                <label className="field-block">
                  <span>{t("concepts.group")}</span>
                  <select name="parentConceptId" value={form.parentConceptId} onChange={handleChange}>
                    <option value="">{`-- ${t("concepts.noGroup")} --`}</option>
                    {groupOptions.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              )
            ) : (
              <label className="field-block">
                <span>{t("concepts.groupType")}</span>
                <select name="groupType" value={form.groupType} onChange={handleChange}>
                  <option value="income">{t("concepts.groupTypeIncome")}</option>
                  <option value="expense">{t("concepts.groupTypeExpense")}</option>
                </select>
              </label>
            )}

            {moduleType === "products" ? (
              <label className="field-block">
                <span>{t("concepts.taxPercentage")}</span>
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
              </label>
            ) : null}

            {moduleType === "products" && (
              <>
                <label className="field-block">
                  <span>{t("transactions.price")}</span>
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t("transactions.price")}
                    value={form.price}
                    onChange={handleChange}
                    required
                  />
                </label>
                <label className="field-block">
                  <span>{t("transactions.additionalCharges")}</span>
                  <input
                    name="additionalCharges"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t("transactions.additionalCharges")}
                    value={form.additionalCharges}
                    onChange={handleChange}
                    required
                  />
                </label>
              </>
            )}
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

export default ConceptModuleFormPage;
