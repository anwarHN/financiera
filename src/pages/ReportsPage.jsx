import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { getBudgetExecutionReport, getProjectExecutionReport, listBudgets } from "../services/budgetsService";
import { listCurrencies } from "../services/currenciesService";
import { listProjects } from "../services/projectsService";
import { exportReportXlsx, getTransactionsForReports } from "../services/reportsService";
import { listInternalObligationsForReport } from "../services/transactionsService";
import { formatNumber } from "../utils/numberFormat";

const reportCatalog = [
  { id: "sales", titleKey: "reports.sales", filters: ["dateRange", "currency"] },
  { id: "receivable", titleKey: "reports.accountsReceivable", filters: ["dateRange", "currency"] },
  { id: "payable", titleKey: "reports.accountsPayable", filters: ["dateRange", "currency"] },
  { id: "internal_obligations", titleKey: "reports.internalObligations", filters: ["dateRange", "currency"] },
  { id: "budget_execution", titleKey: "reports.budgetExecution", filters: ["budget"] },
  { id: "project_execution", titleKey: "reports.projectExecution", filters: ["project", "dateRange"] },
  { id: "expenses", titleKey: "reports.expenses", filters: ["dateRange", "currency"] },
  { id: "cashflow", titleKey: "reports.cashflow", filters: ["dateRange", "currency"] }
];

function ReportsPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const [selectedReport, setSelectedReport] = useState("sales");
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", currencyId: "", budgetId: "", projectId: "" });
  const [currencies, setCurrencies] = useState([]);
  const [projects, setProjects] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [hasExecuted, setHasExecuted] = useState(false);
  const [showSetup, setShowSetup] = useState(true);

  const reportConfig = useMemo(() => reportCatalog.find((report) => report.id === selectedReport) ?? reportCatalog[0], [selectedReport]);

  useEffect(() => {
    if (!account?.accountId) return;
    loadDependencies();
  }, [account?.accountId]);

  const loadDependencies = async () => {
    try {
      const [currenciesData, projectsData, budgetsData] = await Promise.all([
        listCurrencies(account.accountId).catch(() => []),
        listProjects(account.accountId).catch(() => []),
        listBudgets(account.accountId).catch(() => [])
      ]);
      setCurrencies(currenciesData);
      setProjects(projectsData);
      setBudgets(budgetsData);
    } catch {
      setCurrencies([]);
      setProjects([]);
      setBudgets([]);
    }
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const buildResults = (transactions, reportId) => {
    if (reportId === "internal_obligations") return transactions;
    if (reportId === "sales") return transactions.filter((tx) => tx.type === 1);
    if (reportId === "expenses") return transactions.filter((tx) => tx.type === 2);
    if (reportId === "receivable") return transactions.filter((tx) => tx.isAccountReceivable && Number(tx.balance || 0) > 0);
    if (reportId === "payable") return transactions.filter((tx) => tx.isAccountPayable && Number(tx.balance || 0) > 0);
    if (reportId === "cashflow") {
      const grouped = new Map();
      transactions.forEach((tx) => {
        if (!tx.accountPaymentFormId) return;
        if (!(tx.isIncomingPayment || tx.isOutcomingPayment || tx.type === 2)) return;
        const key = String(tx.accountPaymentFormId);
        const label = tx.account_payment_forms?.name || `#${tx.accountPaymentFormId}`;
        const signedAmount = tx.isIncomingPayment ? Math.abs(Number(tx.total || 0)) : -Math.abs(Number(tx.total || 0));
        const item = grouped.get(key) || { id: key, date: "-", typeLabel: label, total: 0, balance: 0 };
        item.total += signedAmount;
        grouped.set(key, item);
      });
      return Array.from(grouped.values());
    }
    return transactions;
  };

  const executeReport = async () => {
    if (!account?.accountId || !selectedReport) return;

    try {
      setIsLoading(true);

      if (selectedReport === "budget_execution") {
        if (!filters.budgetId) {
          setError(t("reports.budgetRequired"));
          return;
        }
        const rows = await getBudgetExecutionReport({
          accountId: account.accountId,
          budgetId: Number(filters.budgetId),
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined
        });
        setResults(rows);
      } else if (selectedReport === "project_execution") {
        if (!filters.projectId) {
          setError(t("reports.projectRequired"));
          return;
        }
        const rows = await getProjectExecutionReport({
          accountId: account.accountId,
          projectId: Number(filters.projectId),
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined
        });
        setResults(rows);
      } else if (selectedReport === "internal_obligations") {
        const internalRows = await listInternalObligationsForReport(account.accountId, {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          currencyId: filters.currencyId ? Number(filters.currencyId) : undefined
        });
        setResults(buildResults(internalRows, selectedReport));
      } else {
        const transactions = await getTransactionsForReports(account.accountId, {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined
        });
        const filteredByCurrency = filters.currencyId
          ? transactions.filter((tx) => String(tx.currencyId ?? "") === filters.currencyId)
          : transactions;
        setResults(buildResults(filteredByCurrency, selectedReport));
      }

      setHasExecuted(true);
      setShowSetup(false);
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const rowsWithTypeLabel = useMemo(
    () =>
      results.map((tx) => ({
        ...tx,
        typeLabel:
          selectedReport === "budget_execution" || selectedReport === "project_execution"
            ? tx.conceptName || "-"
            : selectedReport === "internal_obligations"
              ? tx.name || t("reports.internalObligations")
              : selectedReport === "cashflow"
                ? tx.typeLabel || "-"
                : tx.type === 1
                  ? t("reports.sales")
                  : tx.type === 2
                    ? t("reports.expenses")
                    : t("reports.incomes")
      })),
    [results, selectedReport, t]
  );

  const budgetExecutionTotals = useMemo(() => {
    if (!["budget_execution", "project_execution"].includes(selectedReport)) return null;
    return results.reduce(
      (acc, row) => {
        acc.budgeted += Number(row.budgeted || 0);
        acc.executed += Number(row.executed || 0);
        acc.variance += Number(row.variance || 0);
        return acc;
      },
      { budgeted: 0, executed: 0, variance: 0 }
    );
  }, [results, selectedReport]);
  const canExportCurrentReport = !["budget_execution", "project_execution"].includes(selectedReport);

  const appliedFilters = useMemo(() => {
    const currencyName = currencies.find((c) => String(c.id) === String(filters.currencyId))?.name || t("reports.currencyFilterHint");
    const budgetName = budgets.find((b) => String(b.id) === String(filters.budgetId))?.name || "-";
    const projectName = projects.find((p) => String(p.id) === String(filters.projectId))?.name || "-";
    return [
      `${t("reports.dateFrom")}: ${filters.dateFrom || "-"}`,
      `${t("reports.dateTo")}: ${filters.dateTo || "-"}`,
      `${t("reports.currencyFilter")}: ${currencyName}`,
      `${t("reports.budget")}: ${budgetName}`,
      `${t("projects.project")}: ${projectName}`
    ];
  }, [filters, currencies, budgets, projects, t]);

  const total = useMemo(() => results.reduce((acc, item) => acc + Number(item.total || 0), 0), [results]);
  const balance = useMemo(() => results.reduce((acc, item) => acc + Number(item.balance || 0), 0), [results]);
  const salesAdditionalChargesTotal = useMemo(() => {
    if (selectedReport !== "sales") return 0;
    return results.reduce((acc, item) => acc + Number(item.additionalCharges || 0), 0);
  }, [results, selectedReport]);

  const handleExport = async () => {
    if (!account?.accountId || !selectedReport || isExporting) return;

    try {
      setIsExporting(true);
      const exported = await exportReportXlsx({
        accountId: account.accountId,
        reportId: selectedReport,
        dateFrom: filters.dateFrom || null,
        dateTo: filters.dateTo || null,
        currencyId: filters.currencyId ? Number(filters.currencyId) : null,
        budgetId: filters.budgetId ? Number(filters.budgetId) : null,
        projectId: filters.projectId ? Number(filters.projectId) : null
      });
      window.open(exported.downloadUrl, "_blank", "noopener,noreferrer");
      setError("");
    } catch (err) {
      setError(err?.message || t("common.genericLoadError"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="module-page">
      <h1>{t("reports.title")}</h1>
      {error && <p className="error-text">{error}</p>}

      {showSetup && (
        <div className="grid-2">
          <section className="generic-panel">
            <h3>{t("reports.availableReports")}</h3>
            <div className="reports-list" role="listbox" aria-label={t("reports.availableReports")}>
              {reportCatalog.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  className={`reports-list-item ${selectedReport === report.id ? "active" : ""}`}
                  aria-selected={selectedReport === report.id}
                  onClick={() => setSelectedReport(report.id)}
                >
                  {t(report.titleKey)}
                </button>
              ))}
            </div>
          </section>

          <section className="generic-panel">
            <h3>{t("reports.applicableFilters")}</h3>
            <div className="form-grid-2">
              {reportConfig.filters.includes("dateRange") && (
                <>
                  <label className="field-block">
                    <span>{t("reports.dateFrom")}</span>
                    <input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleFilterChange} />
                  </label>
                  <label className="field-block">
                    <span>{t("reports.dateTo")}</span>
                    <input type="date" name="dateTo" value={filters.dateTo} onChange={handleFilterChange} />
                  </label>
                </>
              )}

              {reportConfig.filters.includes("currency") && (
                <label className="field-block form-span-2">
                  <span>{t("reports.currencyFilter")}</span>
                  <select name="currencyId" value={filters.currencyId} onChange={handleFilterChange}>
                    <option value="">{`-- ${t("reports.currencyFilterHint")} --`}</option>
                    {currencies.map((currency) => (
                      <option key={currency.id} value={currency.id}>
                        {currency.name} ({currency.symbol})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {reportConfig.filters.includes("budget") && (
                <label className="field-block form-span-2">
                  <span>{t("reports.budget")}</span>
                  <select name="budgetId" value={filters.budgetId} onChange={handleFilterChange}>
                    <option value="">{`-- ${t("reports.selectBudget")} --`}</option>
                    {budgets.map((budget) => (
                      <option key={budget.id} value={budget.id}>
                        {budget.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {reportConfig.filters.includes("project") && (
                <label className="field-block form-span-2">
                  <span>{t("projects.project")}</span>
                  <select name="projectId" value={filters.projectId} onChange={handleFilterChange}>
                    <option value="">{`-- ${t("reports.selectProject")} --`}</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </section>
        </div>
      )}

      <div className="actions-menu">
        <div className="actions-primary">
          {!hasExecuted || showSetup ? (
            <button type="button" className="action-btn main" disabled={!selectedReport || isLoading} onClick={executeReport}>
              {t("reports.run")}
            </button>
          ) : (
            <>
              <button type="button" className="action-btn" onClick={() => setShowSetup(true)}>
                {t("reports.changeReportFilters")}
              </button>
              {canExportCurrentReport ? (
                <button type="button" className="action-btn" onClick={handleExport} disabled={isExporting}>
                  {isExporting ? t("common.loading") : t("reports.exportExcel")}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {hasExecuted && !showSetup && (
        <section className="generic-panel">
          <h3>{t(reportConfig.titleKey)}</h3>
          {appliedFilters.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>
            {t("reports.totalRecords")}: {results.length}
          </p>

          {budgetExecutionTotals ? (
            <p>
              {t("budgets.totalBudget")}: {formatNumber(budgetExecutionTotals.budgeted)} | {t("reports.executed")}: {formatNumber(budgetExecutionTotals.executed)} | {t("reports.variance")}: {formatNumber(budgetExecutionTotals.variance)}
            </p>
          ) : (
            <>
              <p>
                {t("transactions.total")}: {formatNumber(total)}
              </p>
              {selectedReport === "sales" ? (
                <p>
                  {t("transactions.additionalCharges")}: {formatNumber(salesAdditionalChargesTotal)}
                </p>
              ) : null}
              {(selectedReport === "receivable" ||
                selectedReport === "payable" ||
                selectedReport === "internal_obligations" ||
                selectedReport === "cashflow") && (
                <p>
                  {t("transactions.balance")}: {formatNumber(balance)}
                </p>
              )}
            </>
          )}

          <table className="crud-table">
            <thead>
              {budgetExecutionTotals ? (
                <tr>
                  <th>{t("transactions.concept")}</th>
                  <th>{t("budgets.budgetAmount")}</th>
                  <th>{t("reports.executed")}</th>
                  <th>{t("reports.variance")}</th>
                </tr>
              ) : (
                <tr>
                  <th>ID</th>
                  <th>{t("transactions.date")}</th>
                  <th>{t("common.type")}</th>
                  <th>{t("transactions.total")}</th>
                  <th>{t("transactions.balance")}</th>
                </tr>
              )}
            </thead>
            <tbody>
              {rowsWithTypeLabel.length === 0 ? (
                <tr>
                  <td colSpan={budgetExecutionTotals ? 4 : 5}>{t("common.empty")}</td>
                </tr>
              ) : budgetExecutionTotals ? (
                rowsWithTypeLabel.map((tx) => (
                  <tr key={`${selectedReport}-${tx.id}`}>
                    <td>{tx.typeLabel}</td>
                    <td>{formatNumber(tx.budgeted || 0)}</td>
                    <td>{formatNumber(tx.executed || 0)}</td>
                    <td>{formatNumber(tx.variance || 0)}</td>
                  </tr>
                ))
              ) : (
                rowsWithTypeLabel.map((tx) => (
                  <tr key={`${selectedReport}-${tx.id}-${tx.date}`}>
                    <td>{tx.id}</td>
                    <td>{tx.date}</td>
                    <td>{tx.typeLabel}</td>
                    <td>{formatNumber(tx.total || 0)}</td>
                    <td>{formatNumber(tx.balance || 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export default ReportsPage;
