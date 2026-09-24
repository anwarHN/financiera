import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import {
  createBudgetWithLines,
  getBudgetById,
  listBudgetLines,
  updateBudgetWithLines
} from "../services/budgetsService";
import { listConcepts } from "../services/conceptsService";
import { listProjects } from "../services/projectsService";
import { listCurrencies } from "../services/currenciesService";
import LookupCombobox from "../components/LookupCombobox";
import ConceptModuleFormPage from "./ConceptModuleFormPage";
import { useModulePermissions } from "../hooks/useModulePermissions";

const conceptModules = {
  expense: { titleKey: "actions.newExpenseConcept", basePath: "/expense-concepts" },
  income: { titleKey: "actions.newIncomeConcept", basePath: "/income-concepts" },
  products: { titleKey: "actions.newProduct", basePath: "/products" }
};

const initialHeader = {
  name: "",
  periodType: "monthly",
  periodStart: "",
  periodEnd: "",
  projectId: "",
  currencyId: ""
};

function BudgetFormPage({ embedded = false, onCancel, onCreated, itemId = null }) {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const activeAccountId = useRef(account?.accountId);
  activeAccountId.current = account?.accountId;
  const { canCreate: canCreateConcept } = useModulePermissions("concepts");
  const navigate = useNavigate();
  const { id } = useParams();
  const currentId = embedded ? itemId : id;
  const isEdit = Boolean(currentId);

  const [header, setHeader] = useState(initialHeader);
  const [lines, setLines] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [conceptModule, setConceptModule] = useState("expense");

  const conceptOptions = useMemo(
    () => concepts.filter((item) => !item.isGroup && (item.isIncome || item.isExpense || item.isProduct)),
    [concepts]
  );

  useEffect(() => {
    if (!account?.accountId) return;
    let cancelled = false;
    setHeader(initialHeader);
    setLines([]);
    setConceptModule("expense");
    setProjects([]);
    setConcepts([]);
    setCurrencies([]);
    setError("");
    setIsLoading(true);
    const isCancelled = () => cancelled;
    Promise.all([loadDependencies(isCancelled), isEdit ? loadBudget(isCancelled) : Promise.resolve()])
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [isEdit, currentId, account?.accountId]);

  const loadDependencies = async (isCancelled) => {
    try {
      const [conceptsData, projectsData, currenciesData] = await Promise.all([listConcepts(account.accountId), listProjects(account.accountId), listCurrencies(account.accountId)]);
      if (isCancelled()) return;
      setConcepts(conceptsData);
      setProjects(projectsData);
      setCurrencies(currenciesData);
      if (!isEdit) {
        const local = currenciesData.find((currency) => currency.isLocal && Number(currency.accountId) === Number(account.accountId))
          || currenciesData.find((currency) => currency.isLocal);
        setHeader({ ...initialHeader, currencyId: local ? String(local.id) : "" });
        setLines([]);
      }
    } catch {
      if (!isCancelled()) setError(t("common.genericLoadError"));
    }
  };

  const loadBudget = async (isCancelled) => {
    try {
      setIsLoading(true);
      const [budget, budgetLines] = await Promise.all([getBudgetById(currentId, account.accountId), listBudgetLines(currentId)]);
      if (isCancelled()) return;
      setHeader({
        name: budget.name || "",
        periodType: budget.periodType || "monthly",
        periodStart: budget.periodStart || "",
        periodEnd: budget.periodEnd || "",
        projectId: budget.projectId ? String(budget.projectId) : "",
        currencyId: budget.currencyId ? String(budget.currencyId) : ""
      });
      setLines(
        (budgetLines || []).map((line) => ({
          rowId: String(line.id),
          conceptId: String(line.conceptId),
          amount: Number(line.amount || 0)
        }))
      );
      setError("");
    } catch {
      if (!isCancelled()) setError(t("common.genericLoadError"));
    }
  };

  const addLine = () => {
    setLines((prev) => [...prev, { rowId: `${Date.now()}-${Math.random()}`, conceptId: "", amount: 0 }]);
  };

  const updateLine = (rowId, field, value) => {
    setLines((prev) => prev.map((line) => (line.rowId === rowId ? { ...line, [field]: value } : line)));
  };

  const removeLine = (rowId) => {
    setLines((prev) => prev.filter((line) => line.rowId !== rowId));
  };

  const selectLineConcept = (rowId, concept) => {
    setLines((prev) => prev.map((line) => line.rowId === rowId
      ? { ...line, conceptId: String(concept.id), conceptLookup: concept.name }
      : line));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      setError(t("common.requiredFields"));
      return;
    }
    if (!account?.accountId || !user?.id || !currencies.some((currency) => String(currency.id) === header.currencyId)) {
      setError(t("common.requiredFields"));
      return;
    }

    const payload = {
      accountId: account.accountId,
      name: header.name.trim(),
      periodType: header.periodType,
      periodStart: header.periodStart,
      periodEnd: header.periodEnd,
      projectId: header.projectId ? Number(header.projectId) : null,
      currencyId: Number(header.currencyId),
      isActive: true,
      createdById: user.id
    };

    const normalizedLines = lines
      .filter((line) => line.conceptId)
      .map((line) => ({ conceptId: Number(line.conceptId), amount: Number(line.amount || 0) }));
    if (normalizedLines.length === 0 || lines.some((line) => !line.conceptId)) {
      setError(t("common.requiredFields"));
      return;
    }

    try {
      setIsSaving(true);
      let created = null;
      if (isEdit) {
        created = await updateBudgetWithLines(currentId, { budget: payload, lines: normalizedLines });
      } else {
        created = await createBudgetWithLines({ budget: payload, lines: normalizedLines });
      }
      if (embedded) {
        onCreated?.(created);
        return;
      }
      navigate("/budgets");
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
          <h1>{isEdit ? t("common.edit") : t("actions.newBudget")}</h1>
          <Link to="/budgets" className="button-link-secondary">
            {t("common.backToList")}
          </Link>
        </div>
      ) : (
        <h3>{isEdit ? t("common.edit") : t("actions.newBudget")}</h3>
      )}
      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <form className="crud-form" onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <label className="field-block">
              <span>{t("transactions.currency")}</span>
              <select required value={header.currencyId} onChange={(event) => setHeader((prev) => ({ ...prev, currencyId: event.target.value }))}>
                <option value="">--</option>
                {currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} ({currency.symbol})</option>)}
              </select>
            </label>
            <label className="field-block">
              <span>{t("common.name")}</span>
              <input
                name="name"
                value={header.name}
                onChange={(event) => setHeader((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label className="field-block">
              <span>{t("budgets.periodType")}</span>
              <select
                name="periodType"
                value={header.periodType}
                onChange={(event) => setHeader((prev) => ({ ...prev, periodType: event.target.value }))}
              >
                <option value="daily">{t("budgets.periods.daily")}</option>
                <option value="weekly">{t("budgets.periods.weekly")}</option>
                <option value="monthly">{t("budgets.periods.monthly")}</option>
                <option value="yearly">{t("budgets.periods.yearly")}</option>
              </select>
            </label>
            <label className="field-block">
              <span>{t("reports.dateFrom")}</span>
              <input type="date" name="periodStart" value={header.periodStart} onChange={(event) => setHeader((prev) => ({ ...prev, periodStart: event.target.value }))} />
            </label>
            <label className="field-block">
              <span>{t("reports.dateTo")}</span>
              <input type="date" name="periodEnd" value={header.periodEnd} onChange={(event) => setHeader((prev) => ({ ...prev, periodEnd: event.target.value }))} />
            </label>
            <label className="field-block form-span-2">
              <span>{t("projects.project")}</span>
              <select
                name="projectId"
                value={header.projectId}
                onChange={(event) => setHeader((prev) => ({ ...prev, projectId: event.target.value }))}
              >
                <option value="">{`-- ${t("projects.optionalProject")} --`}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <section className="crud-form-section">
            <div className="page-header-row">
              <h2 className="crud-form-section-title">{t("budgets.lines")}</h2>
              <button type="button" className="button-secondary" onClick={addLine}>
                {t("budgets.addLine")}
              </button>
            </div>
            <table className="crud-table">
              <thead>
                <tr>
                  <th>{t("transactions.concept")}</th>
                  <th>{t("budgets.budgetAmount")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={3}>{t("common.empty")}</td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.rowId}>
                      <td>
                        <LookupCombobox
                          value={line.conceptLookup ?? concepts.find((concept) => String(concept.id) === line.conceptId)?.name ?? ""}
                          onValueChange={(value) => setLines((prev) => prev.map((item) => item.rowId === line.rowId
                            ? { ...item, conceptId: "", conceptLookup: value }
                            : item))}
                          options={conceptOptions}
                          getOptionLabel={(concept) => concept.name || ""}
                          onSelect={(concept) => selectLineConcept(line.rowId, concept)}
                          placeholder={t("transactions.selectConcept")}
                          noResultsText={t("common.empty")}
                          required
                          onCreateRecord={(concept) => {
                            if (!concept?.id || activeAccountId.current !== account.accountId) return;
                            setConcepts((prev) => [...prev.filter((item) => item.id !== concept.id), concept]
                              .sort((a, b) => a.name.localeCompare(b.name)));
                            selectLineConcept(line.rowId, concept);
                          }}
                          renderCreateModal={canCreateConcept ? ({ isOpen, onClose, onCreated }) => isOpen ? (
                            <div className="modal-backdrop" onSubmit={(event) => event.stopPropagation()}>
                              <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                                <label className="field-block">
                                  <span>{t("transactions.concept")}</span>
                                  <select value={conceptModule} onChange={(event) => setConceptModule(event.target.value)}>
                                    {Object.entries(conceptModules).map(([type, config]) => (
                                      <option key={type} value={type}>{t(config.titleKey)}</option>
                                    ))}
                                  </select>
                                </label>
                                <ConceptModuleFormPage
                                  key={`${account.accountId}-${conceptModule}`}
                                  embedded
                                  moduleType={conceptModule}
                                  {...conceptModules[conceptModule]}
                                  onCancel={onClose}
                                  onCreated={onCreated}
                                />
                              </div>
                            </div>
                          ) : null : undefined}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={line.amount}
                          onChange={(event) => updateLine(line.rowId, "amount", event.target.value)}
                        />
                      </td>
                      <td>
                        <button type="button" className="button-danger" onClick={() => removeLine(line.rowId)}>
                          {t("common.delete")}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

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

export default BudgetFormPage;
