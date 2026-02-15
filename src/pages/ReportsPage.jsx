import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listCurrencies } from "../services/currenciesService";
import { exportReportXlsx, getTransactionsForReports } from "../services/reportsService";
import { listInternalObligationsForReport } from "../services/transactionsService";

const reportCatalog = [
  { id: "sales", titleKey: "reports.sales", filters: ["dateRange", "currency"] },
  { id: "receivable", titleKey: "reports.accountsReceivable", filters: ["dateRange", "currency"] },
  { id: "payable", titleKey: "reports.accountsPayable", filters: ["dateRange", "currency"] },
  { id: "internal_obligations", titleKey: "reports.internalObligations", filters: ["dateRange", "currency"] },
  { id: "expenses", titleKey: "reports.expenses", filters: ["dateRange", "currency"] },
  { id: "cashflow", titleKey: "reports.cashflow", filters: ["dateRange", "currency"] }
];

function ReportsPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const [selectedReport, setSelectedReport] = useState("sales");
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", currencyId: "" });
  const [currencies, setCurrencies] = useState([]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [hasExecuted, setHasExecuted] = useState(false);
  const [showSetup, setShowSetup] = useState(true);

  const reportConfig = useMemo(
    () => reportCatalog.find((report) => report.id === selectedReport) ?? reportCatalog[0],
    [selectedReport]
  );

  useEffect(() => {
    if (!account?.accountId) return;
    loadCurrencies();
  }, [account?.accountId]);

  const loadCurrencies = async () => {
    try {
      const data = await listCurrencies(account.accountId);
      setCurrencies(data);
    } catch {
      setCurrencies([]);
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
        const item = grouped.get(key) || {
          id: key,
          date: "-",
          typeLabel: label,
          total: 0,
          balance: 0
        };
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
      if (selectedReport === "internal_obligations") {
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
          selectedReport === "internal_obligations"
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

  const appliedFilters = useMemo(() => {
    const currencyName = currencies.find((c) => String(c.id) === String(filters.currencyId))?.name || t("reports.currencyFilterHint");
    return [
      `${t("reports.dateFrom")}: ${filters.dateFrom || "-"}`,
      `${t("reports.dateTo")}: ${filters.dateTo || "-"}`,
      `${t("reports.currencyFilter")}: ${currencyName}`
    ];
  }, [filters, currencies, t]);

  const total = useMemo(() => results.reduce((acc, item) => acc + Number(item.total || 0), 0), [results]);
  const balance = useMemo(() => results.reduce((acc, item) => acc + Number(item.balance || 0), 0), [results]);

  const handleExport = async () => {
    if (!account?.accountId || !selectedReport || isExporting) return;

    try {
      setIsExporting(true);
      const exported = await exportReportXlsx({
        accountId: account.accountId,
        reportId: selectedReport,
        dateFrom: filters.dateFrom || null,
        dateTo: filters.dateTo || null,
        currencyId: filters.currencyId ? Number(filters.currencyId) : null
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
                    <option value="">{t("reports.currencyFilterHint")}</option>
                    {currencies.map((currency) => (
                      <option key={currency.id} value={currency.id}>
                        {currency.name} ({currency.symbol})
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
              <button
                type="button"
                className="action-btn"
                onClick={handleExport}
                disabled={isExporting}
              >
                {isExporting ? t("common.loading") : t("reports.exportExcel")}
              </button>
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
          <p>
            {t("transactions.total")}: {total.toFixed(2)}
          </p>
          {(selectedReport === "receivable" ||
            selectedReport === "payable" ||
            selectedReport === "internal_obligations" ||
            selectedReport === "cashflow") && (
            <p>
              {t("transactions.balance")}: {balance.toFixed(2)}
            </p>
          )}

          <table className="crud-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t("transactions.date")}</th>
                <th>{t("common.type")}</th>
                <th>{t("transactions.total")}</th>
                <th>{t("transactions.balance")}</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithTypeLabel.length === 0 ? (
                <tr>
                  <td colSpan={5}>{t("common.empty")}</td>
                </tr>
              ) : (
                rowsWithTypeLabel.map((tx) => (
                  <tr key={`${selectedReport}-${tx.id}-${tx.date}`}>
                    <td>{tx.id}</td>
                    <td>{tx.date}</td>
                    <td>{tx.typeLabel}</td>
                    <td>{Number(tx.total || 0).toFixed(2)}</td>
                    <td>{Number(tx.balance || 0).toFixed(2)}</td>
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
