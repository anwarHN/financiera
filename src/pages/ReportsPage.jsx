import { useEffect, useMemo, useState } from "react";
import { FiChevronRight } from "react-icons/fi";
import ReadOnlyField from "../components/form/ReadOnlyField";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { getBudgetExecutionReport, getProjectExecutionReport, listBudgets } from "../services/budgetsService";
import { listCurrencies } from "../services/currenciesService";
import { listProjects } from "../services/projectsService";
import {
  exportReportXlsx,
  getCashboxesBalanceReport,
  getCashflowBankBalances,
  getCashflowConceptTotals,
  getCashflowOutstandingBalanceSummary,
  getEmployeeAbsenceTotals,
  getEmployeePayrollReport,
  getEmployeeLoansReport,
  getExpensesByTagAndPaymentForm,
  getOutstandingTransactionsForReports,
  getPendingDeliveriesReport,
  getSalesByEmployeeTotals,
  getTransactionsForReports
} from "../services/reportsService";
import { listInternalObligationsForReport } from "../services/transactionsService";
import { formatDate } from "../utils/dateFormat";
import { formatNumber } from "../utils/numberFormat";

const fullReportCatalog = [
  { id: "sales", titleKey: "reports.sales", filters: ["dateRange", "currency"] },
  { id: "receivable", titleKey: "reports.accountsReceivable", filters: ["dateRange", "currency"] },
  { id: "payable", titleKey: "reports.accountsPayable", filters: ["dateRange", "currency"] },
  { id: "internal_obligations", titleKey: "reports.internalObligations", filters: ["dateRange", "currency"] },
  { id: "budget_execution", titleKey: "reports.budgetExecution", filters: ["budget"] },
  { id: "project_execution", titleKey: "reports.projectExecution", filters: ["project", "dateRange"] },
  { id: "expenses", titleKey: "reports.expenses", filters: ["dateRange", "currency"] },
  { id: "cashflow", titleKey: "reports.cashflow", filters: ["dateRange", "currency"] },
  { id: "employee_absences", titleKey: "reports.employeeAbsences", filters: ["dateRange"] },
  { id: "sales_by_employee", titleKey: "reports.salesByEmployee", filters: ["dateRange", "currency"] },
  { id: "expenses_by_tag_payment_form", titleKey: "reports.expensesByTagPaymentForm", filters: ["dateRange", "currency"] },
  { id: "employee_loans", titleKey: "reports.employeeLoans", filters: ["dateRange", "currency"] },
  { id: "employee_payroll", titleKey: "reports.employeePayroll", filters: ["dateRange", "currency"] },
  { id: "cashboxes_balance", titleKey: "reports.cashboxesBalance", filters: ["dateRange", "currency"] },
  { id: "pending_deliveries", titleKey: "reports.pendingDeliveries", filters: ["dateRange", "currency"] }
];

function ReportsPage() {
  const { t, language } = useI18n();
  const { account, hasModulePermission, hasReportPermission, isSystemAdmin } = useAuth();
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
  const [cashflowSummary, setCashflowSummary] = useState({
    previousBalance: 0,
    periodMovements: 0,
    newBalance: 0,
    receivableOutstanding: 0,
    payableOutstanding: 0
  });
  const [cashflowBankBalances, setCashflowBankBalances] = useState([]);

  const reportCatalog = useMemo(
    () => fullReportCatalog.filter((report) => isSystemAdmin || hasReportPermission(report.id)),
    [hasReportPermission, isSystemAdmin]
  );
  const canReadReportsModule = hasModulePermission("reports", "read");
  const reportConfig = useMemo(
    () => reportCatalog.find((report) => report.id === selectedReport) ?? reportCatalog[0] ?? null,
    [selectedReport, reportCatalog]
  );
  const usesAsOfDateOnly =
    selectedReport === "receivable" ||
    selectedReport === "payable" ||
    selectedReport === "cashboxes_balance" ||
    selectedReport === "pending_deliveries";

  useEffect(() => {
    if (!reportCatalog.length) return;
    if (!reportCatalog.some((report) => report.id === selectedReport)) {
      setSelectedReport(reportCatalog[0].id);
    }
  }, [reportCatalog, selectedReport]);

  useEffect(() => {
    if (
      selectedReport === "receivable" ||
      selectedReport === "payable" ||
      selectedReport === "cashboxes_balance" ||
      selectedReport === "pending_deliveries"
    ) {
      setFilters((prev) => (prev.dateFrom ? { ...prev, dateFrom: "" } : prev));
    }
  }, [selectedReport]);

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
    if (reportId === "receivable" || reportId === "payable") {
      const byParty = new Map();
      (transactions || []).forEach((tx) => {
        const partyId = Number(tx.personId || 0) || 0;
        const partyName = tx.persons?.name || t("reports.unassignedPerson");
        const key = `${partyId}-${partyName}`;
        if (!byParty.has(key)) {
          byParty.set(key, {
            partyId,
            partyName,
            details: [],
            total: 0,
            balance: 0
          });
        }
        const bucket = byParty.get(key);
        bucket.details.push(tx);
        bucket.total += Number(tx.total || 0);
        bucket.balance += Number(tx.balance || 0);
      });

      return Array.from(byParty.values())
        .map((group) => ({
          ...group,
          details: group.details.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
        }))
        .sort((a, b) => a.partyName.localeCompare(b.partyName));
    }
    if (reportId === "cashflow") {
      const rows = Array.isArray(transactions) ? transactions : [];
      const byFlow = new Map();
      rows.forEach((row) => {
        const flowKey = row.flowType === "income" ? "income" : "expense";
        const groupKey = row.groupName || "-";
        const conceptKey = row.conceptName || "-";

        if (!byFlow.has(flowKey)) byFlow.set(flowKey, new Map());
        const byGroup = byFlow.get(flowKey);
        if (!byGroup.has(groupKey)) {
          byGroup.set(groupKey, { groupName: groupKey, total: 0, concepts: new Map() });
        }
        const groupItem = byGroup.get(groupKey);
        groupItem.total += Number(row.total || 0);

        const existingConcept = groupItem.concepts.get(conceptKey) || { conceptName: conceptKey, total: 0 };
        existingConcept.total += Number(row.total || 0);
        groupItem.concepts.set(conceptKey, existingConcept);
      });

      const sectionOrder = ["income", "expense"];
      return sectionOrder.map((flow) => {
        const flowGroups = Array.from(byFlow.get(flow)?.values() || [])
          .map((group) => ({
            groupName: group.groupName,
            total: group.total,
            concepts: Array.from(group.concepts.values()).sort((a, b) => a.conceptName.localeCompare(b.conceptName))
          }))
          .sort((a, b) => a.groupName.localeCompare(b.groupName));

        return {
          flow,
          flowLabel: flow === "income" ? t("reports.incomes") : t("reports.expenses"),
          groups: flowGroups,
          total: flowGroups.reduce((acc, group) => acc + Number(group.total || 0), 0)
        };
      });
    }
    if (reportId === "pending_deliveries") {
      const byParty = new Map();
      (transactions || []).forEach((row) => {
        const partyName = row.personName || t("reports.unassignedPerson");
        if (!byParty.has(partyName)) {
          byParty.set(partyName, {
            personName: partyName,
            totalPendingQuantity: 0,
            products: new Map()
          });
        }

        const partyBucket = byParty.get(partyName);
        partyBucket.totalPendingQuantity += Number(row.pendingQuantity || 0);

        const productName = row.conceptName || "-";
        if (!partyBucket.products.has(productName)) {
          partyBucket.products.set(productName, {
            conceptName: productName,
            totalPendingQuantity: 0,
            details: []
          });
        }

        const productBucket = partyBucket.products.get(productName);
        productBucket.totalPendingQuantity += Number(row.pendingQuantity || 0);
        productBucket.details.push(row);
      });

      return Array.from(byParty.values())
        .map((party) => ({
          personName: party.personName,
          totalPendingQuantity: party.totalPendingQuantity,
          products: Array.from(party.products.values())
            .map((product) => ({
              conceptName: product.conceptName,
              totalPendingQuantity: product.totalPendingQuantity,
              details: product.details.sort((a, b) => {
                if (String(b.date || "") !== String(a.date || "")) {
                  return String(b.date || "").localeCompare(String(a.date || ""));
                }
                return Number(b.transactionId || 0) - Number(a.transactionId || 0);
              })
            }))
            .sort((a, b) => a.conceptName.localeCompare(b.conceptName))
        }))
        .sort((a, b) => a.personName.localeCompare(b.personName));
    }
    return transactions;
  };

  const executeReport = async () => {
    if (!account?.accountId || !selectedReport || !reportConfig) return;

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
      } else if (selectedReport === "cashflow") {
        const rows = await getCashflowConceptTotals(account.accountId, {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          currencyId: filters.currencyId || undefined
        });
        const bankBalances = await getCashflowBankBalances(account.accountId, {
          dateTo: filters.dateTo || undefined,
          currencyId: filters.currencyId || undefined
        });
        let outstandingSummary = { receivable: 0, payable: 0 };
        try {
          const outstandingAsOfDate = filters.dateTo || new Date().toISOString().slice(0, 10);
          outstandingSummary = await getCashflowOutstandingBalanceSummary(account.accountId, {
            asOfDate: outstandingAsOfDate,
            currencyId: filters.currencyId || undefined
          });
        } catch {
          outstandingSummary = { receivable: 0, payable: 0 };
        }
        setResults(buildResults(rows, selectedReport));
        const periodMovements = rows.reduce((acc, row) => acc + Number(row.total || 0), 0);

        let previousBalance = 0;
        if (filters.dateFrom) {
          const fromDate = new Date(`${filters.dateFrom}T00:00:00.000Z`);
          fromDate.setUTCDate(fromDate.getUTCDate() - 1);
          const previousTo = fromDate.toISOString().slice(0, 10);
          const previousRows = await getCashflowConceptTotals(account.accountId, {
            dateTo: previousTo,
            currencyId: filters.currencyId || undefined
          });
          previousBalance = previousRows.reduce((acc, row) => acc + Number(row.total || 0), 0);
        }

        setCashflowSummary({
          previousBalance,
          periodMovements,
          newBalance: previousBalance + periodMovements,
          receivableOutstanding: outstandingSummary.receivable,
          payableOutstanding: outstandingSummary.payable
        });
        setCashflowBankBalances(bankBalances);
      } else if (selectedReport === "employee_absences") {
        const rows = await getEmployeeAbsenceTotals(account.accountId, {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined
        });
        setResults(rows);
        setCashflowSummary({
          previousBalance: 0,
          periodMovements: 0,
          newBalance: 0,
          receivableOutstanding: 0,
          payableOutstanding: 0
        });
        setCashflowBankBalances([]);
      } else if (selectedReport === "sales_by_employee") {
        const rows = await getSalesByEmployeeTotals(account.accountId, {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          currencyId: filters.currencyId || undefined
        });
        setResults(rows);
        setCashflowSummary({
          previousBalance: 0,
          periodMovements: 0,
          newBalance: 0,
          receivableOutstanding: 0,
          payableOutstanding: 0
        });
        setCashflowBankBalances([]);
      } else if (selectedReport === "expenses_by_tag_payment_form") {
        const rows = await getExpensesByTagAndPaymentForm(account.accountId, {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          currencyId: filters.currencyId || undefined
        });
        setResults(rows);
        setCashflowSummary({
          previousBalance: 0,
          periodMovements: 0,
          newBalance: 0,
          receivableOutstanding: 0,
          payableOutstanding: 0
        });
        setCashflowBankBalances([]);
      } else if (selectedReport === "employee_loans") {
        const rows = await getEmployeeLoansReport(account.accountId, {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          currencyId: filters.currencyId || undefined
        });
        setResults(rows);
        setCashflowSummary({
          previousBalance: 0,
          periodMovements: 0,
          newBalance: 0,
          receivableOutstanding: 0,
          payableOutstanding: 0
        });
        setCashflowBankBalances([]);
      } else if (selectedReport === "employee_payroll") {
        const rows = await getEmployeePayrollReport(account.accountId, {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          currencyId: filters.currencyId || undefined
        });
        setResults(rows);
        setCashflowSummary({
          previousBalance: 0,
          periodMovements: 0,
          newBalance: 0,
          receivableOutstanding: 0,
          payableOutstanding: 0
        });
        setCashflowBankBalances([]);
      } else if (selectedReport === "cashboxes_balance") {
        const rows = await getCashboxesBalanceReport(account.accountId, {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          currencyId: filters.currencyId || undefined
        });
        setResults(rows);
        setCashflowSummary({
          previousBalance: 0,
          periodMovements: 0,
          newBalance: 0,
          receivableOutstanding: 0,
          payableOutstanding: 0
        });
        setCashflowBankBalances([]);
      } else if (selectedReport === "pending_deliveries") {
        const rows = await getPendingDeliveriesReport(account.accountId, {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          currencyId: filters.currencyId || undefined
        });
        setResults(buildResults(rows, selectedReport));
        setCashflowSummary({
          previousBalance: 0,
          periodMovements: 0,
          newBalance: 0,
          receivableOutstanding: 0,
          payableOutstanding: 0
        });
        setCashflowBankBalances([]);
      } else if (selectedReport === "receivable" || selectedReport === "payable") {
        const rows = await getOutstandingTransactionsForReports(account.accountId, {
          reportId: selectedReport,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          currencyId: filters.currencyId || undefined
        });
        setResults(buildResults(rows, selectedReport));
        setCashflowSummary({
          previousBalance: 0,
          periodMovements: 0,
          newBalance: 0,
          receivableOutstanding: 0,
          payableOutstanding: 0
        });
        setCashflowBankBalances([]);
      } else {
        const transactions = await getTransactionsForReports(account.accountId, {
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined
        });
        const filteredByCurrency = filters.currencyId
          ? transactions.filter((tx) => String(tx.currencyId ?? "") === filters.currencyId)
          : transactions;
        setResults(buildResults(filteredByCurrency, selectedReport));
        setCashflowSummary({
          previousBalance: 0,
          periodMovements: 0,
          newBalance: 0,
          receivableOutstanding: 0,
          payableOutstanding: 0
        });
        setCashflowBankBalances([]);
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
    () => {
      if (selectedReport === "receivable" || selectedReport === "payable") return [];
      return results.map((tx) => ({
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
      }));
    },
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

  const cashflowRowCount = useMemo(() => {
    if (selectedReport !== "cashflow") return 0;
    return results.reduce((acc, section) => {
      const groupCount = section.groups?.length || 0;
      const conceptCount = (section.groups || []).reduce((innerAcc, group) => innerAcc + (group.concepts?.length || 0), 0);
      return acc + groupCount + conceptCount;
    }, 0);
  }, [results, selectedReport]);
  const salesByEmployeeRowCount = useMemo(() => {
    if (selectedReport !== "sales_by_employee") return 0;
    return results.reduce((acc, seller) => acc + (seller.products?.length || 0), 0);
  }, [results, selectedReport]);
  const pendingDeliveriesRowCount = useMemo(() => {
    if (selectedReport !== "pending_deliveries") return 0;
    return results.reduce(
      (acc, party) =>
        acc +
        (party.products || []).reduce(
          (productAcc, product) => productAcc + (product.details?.length || 0),
          0
        ),
      0
    );
  }, [results, selectedReport]);

  const appliedFilters = useMemo(() => {
    const currencyName = currencies.find((c) => String(c.id) === String(filters.currencyId))?.name || t("reports.currencyFilterHint");
    const budgetName = budgets.find((b) => String(b.id) === String(filters.budgetId))?.name || "-";
    const projectName = projects.find((p) => String(p.id) === String(filters.projectId))?.name || "-";
    return [
      ...(!usesAsOfDateOnly ? [`${t("reports.dateFrom")}: ${formatDate(filters.dateFrom, language)}`] : []),
      `${t("reports.dateTo")}: ${formatDate(filters.dateTo, language)}`,
      `${t("reports.currencyFilter")}: ${currencyName}`,
      `${t("reports.budget")}: ${budgetName}`,
      `${t("projects.project")}: ${projectName}`
    ];
  }, [filters, currencies, budgets, projects, t, language, usesAsOfDateOnly]);

  const total = useMemo(() => {
    if (selectedReport === "receivable" || selectedReport === "payable") {
      return results.reduce((acc, group) => acc + Number(group.total || 0), 0);
    }
    if (selectedReport === "employee_payroll") {
      return results.reduce((acc, item) => acc + Number(item.totalPayroll || 0), 0);
    }
    if (selectedReport === "employee_absences") {
      return results.reduce((acc, item) => acc + Number(item.totalAbsences || 0), 0);
    }
    if (selectedReport === "sales_by_employee") {
      return results.reduce((acc, item) => acc + Number(item.total || 0), 0);
    }
    if (selectedReport === "cashboxes_balance") {
      return results.reduce((acc, item) => acc + Number(item.balance || 0), 0);
    }
    if (selectedReport === "pending_deliveries") {
      return results.reduce((acc, item) => acc + Number(item.totalPendingQuantity || 0), 0);
    }
    if (selectedReport === "cashflow") {
      return results.reduce((acc, section) => acc + Number(section.total || 0), 0);
    }
    return results.reduce((acc, item) => acc + Number(item.total || 0), 0);
  }, [results, selectedReport]);
  const balance = useMemo(() => {
    if (selectedReport === "receivable" || selectedReport === "payable") {
      return results.reduce((acc, group) => acc + Number(group.balance || 0), 0);
    }
    return results.reduce((acc, item) => acc + Number(item.balance || 0), 0);
  }, [results, selectedReport]);
  const salesAdditionalChargesTotal = useMemo(() => {
    if (selectedReport !== "sales") return 0;
    return results.reduce((acc, item) => acc + Number(item.additionalCharges || 0), 0);
  }, [results, selectedReport]);
  const cashflowBanksTotal = useMemo(
    () => cashflowBankBalances.reduce((acc, row) => acc + Number(row.balance || 0), 0),
    [cashflowBankBalances]
  );
  const cashflowDifferenceVsNet = useMemo(
    () => Number(cashflowBanksTotal || 0) - Number(cashflowSummary.newBalance || 0),
    [cashflowBanksTotal, cashflowSummary.newBalance]
  );

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
      {!canReadReportsModule ? (
        <p className="error-text">{t("reports.noAccessModule")}</p>
      ) : reportCatalog.length === 0 ? (
        <p className="error-text">{t("reports.noAccessAny")}</p>
      ) : null}
      {error && <p className="error-text">{error}</p>}

      {canReadReportsModule && reportCatalog.length > 0 && reportConfig && showSetup && (
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
                  <span>{t(report.titleKey)}</span>
                  <span className="reports-list-item-indicator" aria-hidden="true">
                    {selectedReport === report.id ? <FiChevronRight /> : null}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="generic-panel">
            <h3>{t("reports.applicableFilters")}</h3>
            <div className="form-grid-2">
              {reportConfig.filters.includes("dateRange") && (
                <>
                  {!usesAsOfDateOnly ? (
                    <label className="field-block">
                      <span>{t("reports.dateFrom")}</span>
                      <input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleFilterChange} />
                    </label>
                  ) : null}
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

      {canReadReportsModule && reportCatalog.length > 0 ? (
      <div className="actions-menu">
        <div className="actions-primary">
          {!hasExecuted || showSetup ? (
            <button type="button" className="action-btn main" disabled={!selectedReport || !reportConfig || isLoading} onClick={executeReport}>
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
      ) : null}

      {canReadReportsModule && reportCatalog.length > 0 && hasExecuted && !showSetup && reportConfig && (
        <section className="generic-panel">
          <h3>{t(reportConfig.titleKey)}</h3>
          {appliedFilters.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>
            {t("reports.totalRecords")}:{" "}
            {formatNumber(
              selectedReport === "cashflow"
                ? cashflowRowCount
                : selectedReport === "sales_by_employee"
                  ? salesByEmployeeRowCount
                  : selectedReport === "pending_deliveries"
                    ? pendingDeliveriesRowCount
                    : results.length,
              {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
              }
            )}
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
              {selectedReport === "employee_absences" ? (
                <p>
                  {t("transactions.total")}: {formatNumber(total, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              ) : null}
              {selectedReport === "sales_by_employee" ? (
                <p>
                  {t("transactions.total")}: {formatNumber(total)}
                </p>
              ) : null}
              {selectedReport === "employee_loans" ? (
                <p>
                  {t("transactions.balance")}: {formatNumber(balance)}
                </p>
              ) : null}
              {selectedReport === "employee_payroll" ? (
                <p>
                  {t("reports.payrollTotal")}: {formatNumber(total)}
                </p>
              ) : null}
              {selectedReport === "cashboxes_balance" ? (
                <p>
                  {t("reports.cashboxesBalancesTotal")}: {formatNumber(total)}
                </p>
              ) : null}
              {selectedReport === "pending_deliveries" ? (
                <p>
                  {t("inventory.deliveries.pendingUnits")}:{" "}
                  {formatNumber(total, { showCurrency: false, minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </p>
              ) : null}
              {(selectedReport === "receivable" ||
                selectedReport === "payable" ||
                selectedReport === "internal_obligations") && (
                <p>
                  {t("transactions.balance")}: {formatNumber(balance)}
                </p>
              )}
            </>
          )}

          {selectedReport === "cashflow" ? (
            <>
              <div className="report-summary-grid">
                <ReadOnlyField label={t("reconciliation.previousBalance")} value={cashflowSummary.previousBalance} type="currency" />
                <ReadOnlyField label={t("reconciliation.periodMovementsSum")} value={cashflowSummary.periodMovements} type="currency" />
                <ReadOnlyField label={t("reconciliation.currentBalance")} value={cashflowSummary.newBalance} type="currency" />
                <ReadOnlyField
                  label={`${t("reports.accountsReceivable")} (${t("common.balance")})`}
                  value={cashflowSummary.receivableOutstanding || 0}
                  type="currency"
                />
                <ReadOnlyField
                  label={`${t("reports.accountsPayable")} (${t("common.balance")})`}
                  value={cashflowSummary.payableOutstanding || 0}
                  type="currency"
                />
                <ReadOnlyField label={t("reports.bankBalancesTotal")} value={cashflowBanksTotal} type="currency" />
                <ReadOnlyField label={t("reports.incomeExpenseNet")} value={cashflowSummary.newBalance} type="currency" />
                <ReadOnlyField label={t("reports.bankVsNetDifference")} value={cashflowDifferenceVsNet} type="currency" />
              </div>
              <div className="report-summary-grid">
                {cashflowBankBalances.length === 0 ? (
                  <ReadOnlyField label={t("reports.bankBalancesByAccount")} value={t("common.empty")} className="report-summary-span-4" />
                ) : (
                  cashflowBankBalances.map((item) => (
                    <ReadOnlyField
                      key={`cashflow-bank-balance-${item.id}`}
                      label={`${item.name}${item.provider ? ` (${item.provider})` : ""}`}
                      value={item.balance || 0}
                      type="currency"
                    />
                  ))
                )}
              </div>
            </>
          ) : null}

          <table className="crud-table">
            <thead>
              {budgetExecutionTotals ? (
                <tr>
                  <th>{t("transactions.concept")}</th>
                  <th className="num-col">{t("budgets.budgetAmount")}</th>
                  <th className="num-col">{t("reports.executed")}</th>
                  <th className="num-col">{t("reports.variance")}</th>
                </tr>
              ) : selectedReport === "cashflow" ? (
                <tr>
                  <th>{t("common.type")}</th>
                  <th>{t("concepts.group")}</th>
                  <th>{t("transactions.concept")}</th>
                  <th className="num-col">{t("transactions.total")}</th>
                </tr>
              ) : selectedReport === "sales_by_employee" ? (
                <tr>
                  <th>{t("transactions.seller")}</th>
                  <th>{t("nav.products")}</th>
                  <th className="num-col">{t("transactions.quantity")}</th>
                  <th className="num-col">{t("transactions.total")}</th>
                </tr>
              ) : selectedReport === "expenses_by_tag_payment_form" ? (
                <tr>
                  <th>{t("reports.tag")}</th>
                  <th>{t("transactions.accountPaymentForm")}</th>
                  <th className="num-col">{t("transactions.total")}</th>
                </tr>
              ) : selectedReport === "employee_payroll" ? (
                <tr>
                  <th>{t("transactions.employee")}</th>
                  <th>{t("common.name")}</th>
                  <th>{t("common.type")}</th>
                  <th>{t("transactions.date")}</th>
                  <th className="num-col">{t("employees.salary")}</th>
                  <th className="num-col">{t("reports.payrollAdjustment")}</th>
                  <th className="num-col">{t("reports.payrollTotal")}</th>
                </tr>
              ) : selectedReport === "employee_loans" ? (
                <tr>
                  <th className="num-col">ID</th>
                  <th>{t("transactions.date")}</th>
                  <th>{t("transactions.employee")}</th>
                  <th>{t("common.name")}</th>
                  <th className="num-col">{t("transactions.total")}</th>
                  <th className="num-col">{t("transactions.paymentsApplied")}</th>
                  <th className="num-col">{t("transactions.balance")}</th>
                </tr>
              ) : selectedReport === "cashboxes_balance" ? (
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("paymentForms.provider")}</th>
                  <th>{t("paymentForms.reference")}</th>
                  <th className="num-col">{t("transactions.balance")}</th>
                </tr>
              ) : selectedReport === "pending_deliveries" ? (
                <tr>
                  <th className="num-col">ID</th>
                  <th>{t("transactions.date")}</th>
                  <th>{t("transactions.person")}</th>
                  <th>{t("transactions.product")}</th>
                  <th className="num-col">{t("transactions.quantity")}</th>
                  <th className="num-col">{t("inventory.deliveries.deliveredQuantity")}</th>
                  <th className="num-col">{t("inventory.deliveries.pendingQuantity")}</th>
                </tr>
              ) : selectedReport === "employee_absences" ? (
                <tr>
                  <th>{t("appointments.employee")}</th>
                  <th className="num-col">{t("transactions.total")}</th>
                </tr>
              ) : selectedReport === "receivable" || selectedReport === "payable" ? (
                <tr>
                  <th>{t("reports.customerSupplier")}</th>
                  <th className="num-col">ID</th>
                  <th>{t("transactions.date")}</th>
                  <th>{t("common.type")}</th>
                  <th className="num-col">{t("transactions.total")}</th>
                  <th className="num-col">{t("transactions.balance")}</th>
                </tr>
              ) : (
                <tr>
                  <th className="num-col">ID</th>
                  <th>{t("transactions.date")}</th>
                  <th>{t("common.type")}</th>
                  <th className="num-col">{t("transactions.total")}</th>
                  <th className="num-col">{t("transactions.balance")}</th>
                </tr>
              )}
            </thead>
            <tbody>
              {(selectedReport === "cashflow"
                ? cashflowRowCount === 0
                : selectedReport === "receivable" || selectedReport === "payable"
                  ? results.length === 0
                  : selectedReport === "employee_payroll"
                    ? results.length === 0
                    : selectedReport === "pending_deliveries"
                      ? results.length === 0
                  : rowsWithTypeLabel.length === 0) ? (
                <tr>
                  <td
                    colSpan={
                      budgetExecutionTotals
                        ? 4
                        : selectedReport === "cashflow"
                          ? 4
                          : selectedReport === "employee_absences"
                            ? 2
                            : selectedReport === "receivable" || selectedReport === "payable"
                              ? 6
                            : selectedReport === "sales_by_employee"
                              ? 4
                              : selectedReport === "expenses_by_tag_payment_form"
                                ? 3
                                : selectedReport === "employee_loans"
                                  ? 7
                                  : selectedReport === "employee_payroll"
                                    ? 7
                                  : selectedReport === "cashboxes_balance"
                                    ? 4
                                    : selectedReport === "pending_deliveries"
                                      ? 7
                                : 5
                    }
                  >
                    {t("common.empty")}
                  </td>
                </tr>
              ) : budgetExecutionTotals ? (
                rowsWithTypeLabel.map((tx) => (
                  <tr key={`${selectedReport}-${tx.id}`}>
                    <td>{tx.typeLabel}</td>
                    <td className="num-col">{formatNumber(tx.budgeted || 0)}</td>
                    <td className="num-col">{formatNumber(tx.executed || 0)}</td>
                    <td className="num-col">{formatNumber(tx.variance || 0)}</td>
                  </tr>
                ))
              ) : selectedReport === "cashflow" ? (
                results.flatMap((section) => [
                  <tr key={`cashflow-section-${section.flow}`} className="report-section-row">
                    <td>{section.flowLabel}</td>
                    <td colSpan={2}>-</td>
                    <td className="num-col">{formatNumber(section.total || 0)}</td>
                  </tr>,
                  ...(section.groups || []).flatMap((group) => [
                    <tr key={`cashflow-group-${section.flow}-${group.groupName}`} className="report-group-row">
                      <td>{section.flowLabel}</td>
                      <td>{group.groupName}</td>
                      <td>-</td>
                      <td className="num-col">{formatNumber(group.total || 0)}</td>
                    </tr>,
                    ...(group.concepts || []).map((concept) => (
                      <tr
                        key={`cashflow-concept-${section.flow}-${group.groupName}-${concept.conceptName}`}
                        className="report-concept-row"
                      >
                        <td>{section.flowLabel}</td>
                        <td>{group.groupName}</td>
                        <td>{concept.conceptName}</td>
                        <td className="num-col">{formatNumber(concept.total || 0)}</td>
                      </tr>
                    ))
                  ])
                ])
              ) : selectedReport === "sales_by_employee" ? (
                results.flatMap((seller) => [
                  <tr key={`sales-seller-${seller.sellerId}-${seller.sellerName}`} className="report-group-row">
                    <td>{seller.sellerName || "-"}</td>
                    <td>-</td>
                    <td className="num-col">{formatNumber(0, { showCurrency: false, minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                    <td className="num-col">{formatNumber(seller.total || 0)}</td>
                  </tr>,
                  ...(seller.products || []).map((product) => (
                    <tr key={`sales-seller-product-${seller.sellerId}-${seller.sellerName}-${product.productName}`} className="report-concept-row">
                      <td>{seller.sellerName || "-"}</td>
                      <td>{product.productName || "-"}</td>
                      <td className="num-col">
                        {formatNumber(product.quantity || 0, { showCurrency: false, minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                      <td className="num-col">{formatNumber(product.total || 0)}</td>
                    </tr>
                  ))
                ])
              ) : selectedReport === "expenses_by_tag_payment_form" ? (
                results.map((row) => (
                  <tr key={`expenses-by-tag-${row.tag}-${row.paymentForm}`}>
                    <td>{row.tag || "-"}</td>
                    <td>{row.paymentForm || "-"}</td>
                    <td className="num-col">{formatNumber(row.total || 0)}</td>
                  </tr>
                ))
              ) : selectedReport === "employee_loans" ? (
                results.map((row) => (
                  <tr key={`employee-loan-${row.id}`}>
                    <td className="num-col">{row.id}</td>
                    <td>{formatDate(row.date, language)}</td>
                    <td>{row.employes?.name || "-"}</td>
                    <td>{row.name || "-"}</td>
                    <td className="num-col">{formatNumber(row.total || 0)}</td>
                    <td className="num-col">{formatNumber(row.payments || 0)}</td>
                    <td className="num-col">{formatNumber(row.balance || 0)}</td>
                  </tr>
                ))
              ) : selectedReport === "employee_payroll" ? (
                results.flatMap((row) => [
                  <tr key={`employee-payroll-${row.employeeId}`} className="report-group-row">
                    <td>{row.employeeName || "-"}</td>
                    <td>{t("reports.subtotal")}</td>
                    <td>-</td>
                    <td>-</td>
                    <td className="num-col">{formatNumber(row.salary || 0)}</td>
                    <td className="num-col">{formatNumber(row.adjustments || 0)}</td>
                    <td className="num-col">{formatNumber(row.totalPayroll || 0)}</td>
                  </tr>,
                  ...(row.details || []).map((detail) => (
                    <tr key={`employee-payroll-detail-${row.employeeId}-${detail.id}`} className="report-concept-row">
                      <td>{row.employeeName || "-"}</td>
                      <td>{detail.name || "-"}</td>
                      <td>{detail.type === 3 ? t("reports.incomes") : t("reports.expenses")}</td>
                      <td>{formatDate(detail.date, language)}</td>
                      <td className="num-col">-</td>
                      <td className="num-col">{formatNumber(detail.total || 0)}</td>
                      <td className="num-col">-</td>
                    </tr>
                  ))
                ])
              ) : selectedReport === "cashboxes_balance" ? (
                results.map((row) => (
                  <tr key={`cashbox-balance-${row.id}`}>
                    <td>{row.name || "-"}</td>
                    <td>{row.provider || "-"}</td>
                    <td>{row.reference || "-"}</td>
                    <td className="num-col">{formatNumber(row.balance || 0)}</td>
                  </tr>
                ))
              ) : selectedReport === "pending_deliveries" ? (
                results.flatMap((party) => [
                  <tr key={`pending-party-${party.personName}`} className="report-group-row">
                    <td>{party.personName}</td>
                    <td colSpan={5}>{t("reports.subtotal")}</td>
                    <td className="num-col">
                      {formatNumber(party.totalPendingQuantity || 0, {
                        showCurrency: false,
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2
                      })}
                    </td>
                  </tr>,
                  ...(party.products || []).flatMap((product) => [
                    <tr key={`pending-product-${party.personName}-${product.conceptName}`} className="report-section-row">
                      <td colSpan={3}>{product.conceptName}</td>
                      <td colSpan={3}>{t("reports.subtotal")}</td>
                      <td className="num-col">
                        {formatNumber(product.totalPendingQuantity || 0, {
                          showCurrency: false,
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>,
                    ...(product.details || []).map((row) => (
                      <tr key={`pending-delivery-${row.transactionId}-${product.conceptName}`}>
                        <td className="num-col">{row.transactionId}</td>
                        <td>{formatDate(row.date, language)}</td>
                        <td>{row.personName || "-"}</td>
                        <td>{row.conceptName || "-"}</td>
                        <td className="num-col">
                          {formatNumber(row.quantity || 0, {
                            showCurrency: false,
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2
                          })}
                        </td>
                        <td className="num-col">
                          {formatNumber(row.quantityDelivered || 0, {
                            showCurrency: false,
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2
                          })}
                        </td>
                        <td className="num-col">
                          {formatNumber(row.pendingQuantity || 0, {
                            showCurrency: false,
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2
                          })}
                        </td>
                      </tr>
                    ))
                  ])
                ])
              ) : selectedReport === "employee_absences" ? (
                results.map((row) => (
                  <tr key={`employee-absence-${row.employeeId}`}>
                    <td>{row.employeeName || "-"}</td>
                    <td className="num-col">
                      {formatNumber(row.totalAbsences || 0, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))
              ) : selectedReport === "receivable" || selectedReport === "payable" ? (
                results.flatMap((group) => [
                  <tr key={`report-party-subtotal-${selectedReport}-${group.partyId}-${group.partyName}`} className="report-group-row">
                    <td>{group.partyName || t("reports.unassignedPerson")}</td>
                    <td className="num-col">-</td>
                    <td>-</td>
                    <td>{t("reports.subtotal")}</td>
                    <td className="num-col">{formatNumber(group.total || 0)}</td>
                    <td className="num-col">{formatNumber(group.balance || 0)}</td>
                  </tr>,
                  ...(group.details || []).map((tx) => (
                    <tr key={`report-party-detail-${selectedReport}-${group.partyId}-${tx.id}`} className="report-concept-row">
                      <td>{group.partyName || t("reports.unassignedPerson")}</td>
                      <td className="num-col">{tx.id}</td>
                      <td>{formatDate(tx.date, language)}</td>
                      <td>
                        {tx.type === 1
                          ? t("reports.sales")
                          : tx.type === 2
                            ? t("reports.expenses")
                            : tx.type === 4
                              ? t("nav.purchases")
                              : t("reports.incomes")}
                      </td>
                      <td className="num-col">{formatNumber(tx.total || 0)}</td>
                      <td className="num-col">{formatNumber(tx.balance || 0)}</td>
                    </tr>
                  ))
                ])
              ) : (
                rowsWithTypeLabel.map((tx) => (
                  <tr key={`${selectedReport}-${tx.id}-${tx.date}`}>
                    <td className="num-col">{tx.id}</td>
                    <td>{formatDate(tx.date, language)}</td>
                    <td>{tx.typeLabel}</td>
                    <td className="num-col">{formatNumber(tx.total || 0)}</td>
                    <td className="num-col">{formatNumber(tx.balance || 0)}</td>
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
