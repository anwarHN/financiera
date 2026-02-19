import { useEffect, useMemo, useState } from "react";
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

const initialHeader = {
  name: "",
  periodType: "monthly",
  periodStart: "",
  periodEnd: "",
  projectId: ""
};

function BudgetFormPage({ embedded = false, onCancel, onCreated, itemId = null }) {
  const { t } = useI18n();
  const { account, user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const currentId = embedded ? itemId : id;
  const isEdit = Boolean(currentId);

  const [header, setHeader] = useState(initialHeader);
  const [lines, setLines] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const conceptOptions = useMemo(
    () => concepts.filter((item) => !item.isGroup && (item.isIncome || item.isExpense || item.isProduct)),
    [concepts]
  );

  useEffect(() => {
    if (!account?.accountId) return;
    loadDependencies();
  }, [account?.accountId]);

  useEffect(() => {
    if (!isEdit || !account?.accountId) return;
    loadBudget();
  }, [isEdit, currentId, account?.accountId]);

  const loadDependencies = async () => {
    try {
      const [conceptsData, projectsData] = await Promise.all([listConcepts(account.accountId), listProjects(account.accountId)]);
      setConcepts(conceptsData);
      setProjects(projectsData);
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      if (!isEdit) setIsLoading(false);
    }
  };

  const loadBudget = async () => {
    try {
      setIsLoading(true);
      const [budget, budgetLines] = await Promise.all([getBudgetById(currentId), listBudgetLines(currentId)]);
      setHeader({
        name: budget.name || "",
        periodType: budget.periodType || "monthly",
        periodStart: budget.periodStart || "",
        periodEnd: budget.periodEnd || "",
        projectId: budget.projectId ? String(budget.projectId) : ""
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
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
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
      name: header.name.trim(),
      periodType: header.periodType,
      periodStart: header.periodStart,
      periodEnd: header.periodEnd,
      projectId: header.projectId ? Number(header.projectId) : null,
      isActive: true,
      createdById: user.id
    };

    const normalizedLines = lines
      .filter((line) => line.conceptId)
      .map((line) => ({ conceptId: Number(line.conceptId), amount: Number(line.amount || 0) }));
    if (normalizedLines.length === 0) {
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
                        <select value={line.conceptId} onChange={(event) => updateLine(line.rowId, "conceptId", event.target.value)}>
                          <option value="">{`-- ${t("transactions.selectConcept")} --`}</option>
                          {conceptOptions.map((concept) => (
                            <option key={concept.id} value={concept.id}>
                              {concept.name}
                            </option>
                          ))}
                        </select>
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
