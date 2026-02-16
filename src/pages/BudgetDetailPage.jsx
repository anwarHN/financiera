import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { getBudgetById, getBudgetExecutionReport } from "../services/budgetsService";
import { formatNumber } from "../utils/numberFormat";

function BudgetDetailPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const { id } = useParams();

  const [budget, setBudget] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!account?.accountId || !id) return;
    loadData();
  }, [account?.accountId, id]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.budgeted += Number(row.budgeted || 0);
          acc.executed += Number(row.executed || 0);
          acc.variance += Number(row.variance || 0);
          return acc;
        },
        { budgeted: 0, executed: 0, variance: 0 }
      ),
    [rows]
  );

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [budgetData, executionRows] = await Promise.all([
        getBudgetById(id),
        getBudgetExecutionReport({ accountId: account.accountId, budgetId: Number(id) })
      ]);
      setBudget(budgetData);
      setRows(executionRows);
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
        <h1>{t("budgets.title")}</h1>
        <Link to="/budgets" className="button-link-secondary">
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
              <strong>{t("common.name")}:</strong> {budget?.name || "-"}
            </p>
            <p>
              <strong>{t("budgets.periodType")}:</strong> {budget?.periodType ? t(`budgets.periods.${budget.periodType}`) : "-"}
            </p>
            <p>
              <strong>{t("reports.dateFrom")}:</strong> {budget?.periodStart || "-"} | <strong>{t("reports.dateTo")}:</strong>{" "}
              {budget?.periodEnd || "-"}
            </p>
            <p>
              {t("budgets.totalBudget")}: {formatNumber(totals.budgeted)} | {t("reports.executed")}: {formatNumber(totals.executed)} |{" "}
              {t("reports.variance")}: {formatNumber(totals.variance)}
            </p>
          </section>

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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4}>{t("common.empty")}</td>
                </tr>
              ) : (
                rows.map((row) => (
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
        </>
      )}
    </div>
  );
}

export default BudgetDetailPage;
