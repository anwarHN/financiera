import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import RowActionsMenu from "../components/RowActionsMenu";
import { listAccountPaymentForms } from "../services/accountPaymentFormsService";
import {
  listTransactionsByAccountPaymentForm,
  reconcileTransaction,
  unreconcileTransaction
} from "../services/transactionsService";
import { formatDate } from "../utils/dateFormat";
import { formatPaymentFormLabel } from "../utils/paymentFormLabel";
import { formatNumber } from "../utils/numberFormat";

function transactionAmount(transaction) {
  const raw = Number(transaction.total || 0);
  const abs = Math.abs(raw);
  if (transaction.isIncomingPayment) return abs;
  if (transaction.isOutcomingPayment) return -abs;
  const type = Number(transaction.type || 0);
  if (type === 1 || type === 3) return abs;
  if (type === 2 || type === 4) return -abs;
  return raw;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function BankReconciliationPage() {
  const { t, language } = useI18n();
  const { account } = useAuth();
  const [forms, setForms] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [dateFrom, setDateFrom] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [reconcileDate, setReconcileDate] = useState(new Date().toISOString().slice(0, 10));
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!account?.accountId) return;
    loadForms();
  }, [account?.accountId]);

  useEffect(() => {
    if (!account?.accountId || !selectedFormId) return;
    loadTransactions();
  }, [account?.accountId, selectedFormId]);

  const loadForms = async () => {
    try {
      const data = await listAccountPaymentForms(account.accountId);
      const filtered = data.filter((item) => item.kind === "bank_account");
      setForms(filtered);
      if (filtered[0]) {
        setSelectedFormId(String(filtered[0].id));
      }
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    }
  };

  const loadTransactions = async () => {
    try {
      const data = await listTransactionsByAccountPaymentForm({
        accountId: account.accountId,
        accountPaymentFormId: Number(selectedFormId)
      });
      setTransactions(data);
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    }
  };

  const activeTransactions = useMemo(() => transactions.filter((row) => row.isActive !== false), [transactions]);

  const periodMovementsSum = useMemo(() => {
    const from = new Date(`${dateFrom}T00:00:00.000Z`);
    const until = new Date(`${dateTo}T23:59:59.999Z`);
    return activeTransactions
      .filter((row) => {
        const txDate = new Date(`${row.date}T00:00:00.000Z`);
        return txDate >= from && txDate <= until;
      })
      .reduce((acc, row) => acc + transactionAmount(row), 0);
  }, [activeTransactions, dateFrom, dateTo]);

  const previousBalance = useMemo(() => {
    return activeTransactions
      .filter((row) => row.isReconciled && row.reconciledAt && row.reconciledAt < dateFrom)
      .reduce((acc, row) => acc + transactionAmount(row), 0);
  }, [activeTransactions, dateFrom]);

  const currentBalance = useMemo(
    () => previousBalance + periodMovementsSum,
    [previousBalance, periodMovementsSum]
  );

  const transactionsInRange = useMemo(() => {
    const from = new Date(`${dateFrom}T00:00:00.000Z`);
    const until = new Date(`${dateTo}T23:59:59.999Z`);
    return activeTransactions.filter((row) => {
      const txDate = new Date(`${row.date}T00:00:00.000Z`);
      return txDate >= from && txDate <= until;
    });
  }, [activeTransactions, dateFrom, dateTo]);

  const isReconcileDateInRange = useMemo(() => {
    if (!reconcileDate || !dateFrom || !dateTo) return false;
    return reconcileDate >= dateFrom && reconcileDate <= dateTo;
  }, [reconcileDate, dateFrom, dateTo]);

  const validateReconcileDateRange = () => {
    if (isReconcileDateInRange) return true;
    setError(t("reconciliation.reconcileDateOutOfRange"));
    return false;
  };

  const selectedForm = useMemo(
    () => forms.find((row) => String(row.id) === String(selectedFormId)) ?? null,
    [forms, selectedFormId]
  );

  const handleExport = async () => {
    if (!selectedForm || transactionsInRange.length === 0) return;
    try {
      setIsExporting(true);
      const currencySymbol = localStorage.getItem("activeCurrencySymbol") || "$";
      const numericValue = (value) => Number(Number(value || 0).toFixed(2)).toString();
      const title = `${t("reconciliation.title")} - ${formatPaymentFormLabel(selectedForm)}`;
      const rowsHtml = transactionsInRange
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.id)}</td>
              <td>${escapeHtml(formatDate(row.date, language))}</td>
              <td>${escapeHtml(row.name || "-")}</td>
              <td>${escapeHtml(row.persons?.name || "-")}</td>
              <td>${escapeHtml(row.referenceNumber || "-")}</td>
              <td>${escapeHtml(currencySymbol)}</td>
              <td>${escapeHtml(numericValue(transactionAmount(row)))}</td>
              <td>${escapeHtml(row.isReconciled ? formatDate(row.reconciledAt, language) : "-")}</td>
            </tr>`
        )
        .join("");

      const documentHtml = `
        <html>
          <head>
            <meta charset="utf-8" />
          </head>
          <body>
            <table>
              <tr><td colspan="3"><strong>${escapeHtml(title)}</strong></td></tr>
              <tr><td>${escapeHtml(t("reconciliation.bankAccount"))}</td><td colspan="2">${escapeHtml(formatPaymentFormLabel(selectedForm))}</td></tr>
              <tr><td>${escapeHtml(t("reports.dateFrom"))}</td><td colspan="2">${escapeHtml(dateFrom)}</td></tr>
              <tr><td>${escapeHtml(t("reports.dateTo"))}</td><td colspan="2">${escapeHtml(dateTo)}</td></tr>
              <tr><td>${escapeHtml(t("reconciliation.previousBalance"))}</td><td>${escapeHtml(currencySymbol)}</td><td>${escapeHtml(numericValue(previousBalance))}</td></tr>
              <tr><td>${escapeHtml(t("reconciliation.periodMovementsSum"))}</td><td>${escapeHtml(currencySymbol)}</td><td>${escapeHtml(numericValue(periodMovementsSum))}</td></tr>
              <tr><td>${escapeHtml(t("reconciliation.currentBalance"))}</td><td>${escapeHtml(currencySymbol)}</td><td>${escapeHtml(numericValue(currentBalance))}</td></tr>
            </table>
            <br />
            <table border="1">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>${escapeHtml(t("transactions.date"))}</th>
                  <th>${escapeHtml(t("transactions.description"))}</th>
                  <th>${escapeHtml(t("transactions.client"))}</th>
                  <th>${escapeHtml(t("transactions.referenceNumber"))}</th>
                  <th>${escapeHtml(t("transactions.currency"))}</th>
                  <th>${escapeHtml(t("transactions.total"))}</th>
                  <th>${escapeHtml(t("reconciliation.reconciled"))}</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </body>
        </html>`;

      const blob = new Blob([documentHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `conciliacion-bancaria-${selectedForm.id}-${dateFrom}-${dateTo}.xls`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleReconcile = async (transactionId) => {
    if (!validateReconcileDateRange()) return;
    try {
      await reconcileTransaction(transactionId, reconcileDate);
      await loadTransactions();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  const handleUnreconcile = async (transactionId) => {
    try {
      await unreconcileTransaction(transactionId);
      await loadTransactions();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  return (
    <div className="module-page">
      <h1>{t("reconciliation.title")}</h1>
      {error && <p className="error-text">{error}</p>}

      <section className="generic-panel">
        <div className="form-grid-2">
          <label className="field-block form-span-2">
            <span>{t("reconciliation.bankAccount")}</span>
            <select value={selectedFormId} onChange={(event) => setSelectedFormId(event.target.value)}>
              <option value="">{`-- ${t("transactions.selectAccountPaymentForm")} --`}</option>
              {forms.map((row) => (
                <option key={row.id} value={row.id}>
                  {formatPaymentFormLabel(row)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-block">
            <span>{t("reports.dateFrom")}</span>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label className="field-block">
            <span>{t("reports.dateTo")}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                const nextDateTo = event.target.value;
                setDateTo(nextDateTo);
                setReconcileDate(nextDateTo);
                if (error === t("reconciliation.reconcileDateOutOfRange")) {
                  setError("");
                }
              }}
            />
          </label>
        </div>
        <div className="reconciliation-summary-row">
          <div className="reconciliation-balances">
            <p>
              {t("reconciliation.previousBalance")}: <strong>{formatNumber(previousBalance)}</strong>
            </p>
            <p>
              {t("reconciliation.currentBalance")}: <strong>{formatNumber(currentBalance)}</strong>
            </p>
            <p>
              {t("reconciliation.periodMovementsSum")}: <strong>{formatNumber(periodMovementsSum)}</strong>
            </p>
          </div>
          <label className="field-block reconciliation-date-field">
            <span>{t("reconciliation.reconcileDate")}</span>
            <input
              type="date"
              value={reconcileDate}
              min={dateFrom}
              max={dateTo}
              onChange={(event) => {
                setReconcileDate(event.target.value);
                if (error === t("reconciliation.reconcileDateOutOfRange")) {
                  setError("");
                }
              }}
            />
            <small>{t("reconciliation.reconcileDateHelp")}</small>
          </label>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={handleExport}
            disabled={!selectedForm || transactionsInRange.length === 0 || isExporting}
          >
            {isExporting ? t("common.loading") : t("reports.exportExcel")}
          </button>
        </div>
      </section>

      <table className="crud-table">
        <thead>
          <tr>
            <th className="num-col">ID</th>
            <th>{t("transactions.date")}</th>
            <th>{t("transactions.description")}</th>
            <th>{t("transactions.client")}</th>
            <th>{t("transactions.referenceNumber")}</th>
            <th className="num-col">{t("transactions.total")}</th>
            <th>{t("reconciliation.reconciled")}</th>
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {transactionsInRange.length === 0 ? (
            <tr>
              <td colSpan={8}>{t("common.empty")}</td>
            </tr>
          ) : (
            transactionsInRange.map((row) => (
              <tr key={row.id}>
                <td className="num-col">{row.id}</td>
                <td>{formatDate(row.date, language)}</td>
                <td>{row.name || "-"}</td>
                <td>{row.persons?.name || "-"}</td>
                <td>{row.referenceNumber || "-"}</td>
                <td className="num-col">{formatNumber(transactionAmount(row))}</td>
                <td>{row.isReconciled ? formatDate(row.reconciledAt, language) : "-"}</td>
                <td className="table-actions reconciliation-actions">
                  {!row.isReconciled ? (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => handleReconcile(row.id)}
                      disabled={!isReconcileDateInRange}
                    >
                      {t("reconciliation.reconcile")}
                    </button>
                  ) : null}
                  <RowActionsMenu
                    actions={[
                      {
                        key: "change-reconcile-date",
                        label: t("reconciliation.changeReconcileDate"),
                        onClick: () => handleReconcile(row.id),
                        disabled: !row.isReconciled || !isReconcileDateInRange
                      },
                      {
                        key: "unreconcile",
                        label: t("reconciliation.unreconcile"),
                        onClick: () => handleUnreconcile(row.id),
                        disabled: !row.isReconciled,
                        danger: true
                      }
                    ]}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default BankReconciliationPage;
