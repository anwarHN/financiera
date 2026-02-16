import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Pagination from "../components/Pagination";
import RowActionsMenu from "../components/RowActionsMenu";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { deactivateBudget, listBudgets, listBudgetLines } from "../services/budgetsService";
import { formatNumber } from "../utils/numberFormat";

const pageSize = 10;

function BudgetsPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const [items, setItems] = useState([]);
  const [lineTotals, setLineTotals] = useState({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!account?.accountId) return;
    loadData();
  }, [account?.accountId]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await listBudgets(account.accountId);
      setItems(data);
      setPage(1);
      setError("");

      const totals = {};
      await Promise.all(
        data.map(async (budget) => {
          const lines = await listBudgetLines(budget.id).catch(() => []);
          totals[budget.id] = lines.reduce((acc, line) => acc + Number(line.amount || 0), 0);
        })
      );
      setLineTotals(totals);
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivate = async (id) => {
    try {
      await deactivateBudget(id);
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  return (
    <div className="module-page">
      <h1>{t("budgets.title")}</h1>
      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <p>{t("common.empty")}</p>
      ) : (
        <>
          <table className="crud-table">
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("budgets.periodType")}</th>
                <th>{t("reports.dateFrom")}</th>
                <th>{t("reports.dateTo")}</th>
                <th>{t("projects.project")}</th>
                <th>{t("budgets.totalBudget")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to={`/budgets/${item.id}`}>{item.name}</Link>
                  </td>
                  <td>{t(`budgets.periods.${item.periodType}`)}</td>
                  <td>{item.periodStart}</td>
                  <td>{item.periodEnd}</td>
                  <td>{item.projects?.name || "-"}</td>
                  <td>{formatNumber(lineTotals[item.id] || 0)}</td>
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        { key: "detail", label: t("transactions.viewDetail"), to: `/budgets/${item.id}` },
                        { key: "edit", label: t("common.edit"), to: `/budgets/${item.id}/edit` },
                        { key: "deactivate", label: t("transactions.deactivate"), onClick: () => handleDeactivate(item.id), danger: true }
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

export default BudgetsPage;
