import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { getProjectExecutionReport } from "../services/budgetsService";
import { getProjectById } from "../services/projectsService";
import { listTransactionsByProject } from "../services/transactionsService";
import { formatDate } from "../utils/dateFormat";
import { formatNumber } from "../utils/numberFormat";

function ProjectDetailPage() {
  const { t, language } = useI18n();
  const { account } = useAuth();
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [executionRows, setExecutionRows] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!account?.accountId || !id) return;
    loadData();
  }, [account?.accountId, id]);

  const totals = useMemo(
    () =>
      executionRows.reduce(
        (acc, row) => {
          acc.budgeted += Number(row.budgeted || 0);
          acc.executed += Number(row.executed || 0);
          acc.variance += Number(row.variance || 0);
          return acc;
        },
        { budgeted: 0, executed: 0, variance: 0 }
      ),
    [executionRows]
  );

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [projectData, reportRows, txRows] = await Promise.all([
        getProjectById(id),
        getProjectExecutionReport({ accountId: account.accountId, projectId: Number(id) }),
        listTransactionsByProject({ accountId: account.accountId, projectId: Number(id) })
      ]);
      setProject(projectData);
      setExecutionRows(reportRows);
      setTransactions(txRows);
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="module-page">
      <div className="page-header-row">
        <h1>{t("projects.title")}</h1>
        <Link to="/projects" className="button-link-secondary">
          {t("common.backToList")}
        </Link>
      </div>
      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <>
          <section className="generic-panel">
            <p>
              <strong>{t("common.name")}:</strong> {project?.name || "-"}
            </p>
            <p>
              <strong>{t("projects.startDate")}:</strong> {formatDate(project?.startDate, language)} | <strong>{t("projects.endDate")}:</strong>{" "}
              {formatDate(project?.endDate, language)}
            </p>
            <p>
              {t("budgets.totalBudget")}: {formatNumber(totals.budgeted)} | {t("reports.executed")}: {formatNumber(totals.executed)} |{" "}
              {t("reports.variance")}: {formatNumber(totals.variance)}
            </p>
          </section>

          <section className="generic-panel">
            <h3>{t("reports.projectExecution")}</h3>
            <table className="crud-table">
              <thead>
                <tr>
                  <th>{t("transactions.concept")}</th>
                  <th>{t("budgets.budgetAmount")}</th>
                  <th>{t("reports.executed")}</th>
                  <th>{t("reports.variance")}</th>
                </tr>
              </thead>
              <tbody>
                {executionRows.length === 0 ? (
                  <tr>
                    <td colSpan={4}>{t("common.empty")}</td>
                  </tr>
                ) : (
                  executionRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.conceptName}</td>
                      <td>{formatNumber(row.budgeted)}</td>
                      <td className={Number(row.executed || 0) > Number(row.budgeted || 0) ? "text-danger" : ""}>
                        {formatNumber(row.executed)}
                      </td>
                      <td>{formatNumber(row.variance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="generic-panel">
            <h3>{t("transactions.detailTitle")}</h3>
            <table className="crud-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t("transactions.date")}</th>
                  <th>{t("common.name")}</th>
                  <th>{t("transactions.total")}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={4}>{t("common.empty")}</td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{tx.id}</td>
                      <td>{formatDate(tx.date, language)}</td>
                      <td>{tx.name || "-"}</td>
                      <td>{formatNumber(tx.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

export default ProjectDetailPage;
