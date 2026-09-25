import { useEffect, useState } from "react";
import BudgetExecutionSummary from "../components/BudgetExecutionSummary";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { getBudgetById, getBudgetExecutionReport } from "../services/budgetsService";
import { formatDate } from "../utils/dateFormat";
import { formatNumber } from "../utils/numberFormat";

function BudgetDetailPage() {
  const { t, language } = useI18n();
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


  const loadData = async () => {
    try {
      setIsLoading(true);
      const [budgetData, executionRows] = await Promise.all([
        getBudgetById(id, account.accountId),
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
              <strong>{t("reports.dateFrom")}:</strong> {formatDate(budget?.periodStart, language)} | <strong>{t("reports.dateTo")}:</strong>{" "}
              {formatDate(budget?.periodEnd, language)}
            </p>
            <p>
              {t("transactions.currency")}: {budget?.currencies?.name || "-"}
            </p>
          </section>

          <BudgetExecutionSummary rows={rows} numberOptions={{ currencySymbol: budget?.currencies?.symbol || "" }} />

          <table className="crud-table">
            <thead>
              <tr>
                <th>{t("transactions.concept")}</th>
                <th className="num-col">{t("budgets.budgetAmount")}</th>
                <th className="num-col">{t("reports.executed")}</th>
                <th className="num-col">{t("reports.variance")}</th>
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
                    <td>{t(`budgets.${row.lineType}`)}: {row.unclassified ? `${t("budgets.unclassified")} / ` : ""}{row.conceptName}{row.unbudgeted ? ` (${t("budgets.unbudgeted")})` : ""}</td>
                    <td className="num-col">{formatNumber(row.budgeted, { currencySymbol: budget?.currencies?.symbol || "" })}</td>
                    <td className={`num-col ${row.variance < 0 ? "text-danger" : ""}`.trim()}>
                      {formatNumber(row.executed, { currencySymbol: budget?.currencies?.symbol || "" })}
                    </td>
                    <td className="num-col">{formatNumber(row.variance, { currencySymbol: budget?.currencies?.symbol || "" })}</td>
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
