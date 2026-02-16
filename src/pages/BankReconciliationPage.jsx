import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { listAccountPaymentForms } from "../services/accountPaymentFormsService";
import { listTransactionsByAccountPaymentForm, reconcileTransaction } from "../services/transactionsService";
import { formatPaymentFormLabel } from "../utils/paymentFormLabel";
import { formatNumber } from "../utils/numberFormat";

function transactionAmount(transaction) {
  return Number(transaction.total || 0);
}

function BankReconciliationPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const [forms, setForms] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [dateFrom, setDateFrom] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [reconcileDate, setReconcileDate] = useState(new Date().toISOString().slice(0, 10));
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState("");

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

  const currentBalance = useMemo(() => transactions.reduce((acc, row) => acc + transactionAmount(row), 0), [transactions]);

  const previousBalance = useMemo(() => {
    const from = new Date(`${dateFrom}T00:00:00.000Z`);
    return transactions
      .filter((row) => row.isReconciled && row.reconciledAt && new Date(row.reconciledAt) < from)
      .reduce((acc, row) => acc + transactionAmount(row), 0);
  }, [transactions, dateFrom]);

  const reconciledBalanceAsOfDate = useMemo(() => {
    const from = new Date(`${dateFrom}T00:00:00.000Z`);
    const until = new Date(`${dateTo}T23:59:59.999Z`);
    return transactions
      .filter(
        (row) =>
          row.isReconciled &&
          row.reconciledAt &&
          new Date(row.reconciledAt) >= from &&
          new Date(row.reconciledAt) <= until
      )
      .reduce((acc, row) => acc + transactionAmount(row), 0);
  }, [transactions, dateFrom, dateTo]);

  const transactionsInRange = useMemo(() => {
    const from = new Date(`${dateFrom}T00:00:00.000Z`);
    const until = new Date(`${dateTo}T23:59:59.999Z`);
    return transactions.filter((row) => {
      const txDate = new Date(`${row.date}T00:00:00.000Z`);
      return txDate >= from && txDate <= until;
    });
  }, [transactions, dateFrom, dateTo]);

  const handleReconcile = async (transactionId) => {
    try {
      await reconcileTransaction(transactionId, `${reconcileDate}T00:00:00.000Z`);
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
          <label className="field-block">
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
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          <label className="field-block">
            <span>{t("reconciliation.reconcileDate")}</span>
            <input type="date" value={reconcileDate} onChange={(event) => setReconcileDate(event.target.value)} />
          </label>
        </div>

        <p>
          {t("reconciliation.currentBalance")}: <strong>{formatNumber(currentBalance)}</strong>
        </p>
        <p>
          {t("reconciliation.previousBalance")}: <strong>{formatNumber(previousBalance)}</strong>
        </p>
        <p>
          {t("reconciliation.reconciledBalanceAsOfDate")}: <strong>{formatNumber(reconciledBalanceAsOfDate)}</strong>
        </p>
      </section>

      <table className="crud-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>{t("transactions.date")}</th>
            <th>{t("transactions.referenceNumber")}</th>
            <th>{t("transactions.total")}</th>
            <th>{t("reconciliation.reconciled")}</th>
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {transactionsInRange.length === 0 ? (
            <tr>
              <td colSpan={6}>{t("common.empty")}</td>
            </tr>
          ) : (
            transactionsInRange.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.date}</td>
                <td>{row.referenceNumber || "-"}</td>
                <td>{formatNumber(row.total)}</td>
                <td>{row.isReconciled ? new Date(row.reconciledAt).toLocaleDateString() : "-"}</td>
                <td>
                  {row.isReconciled ? (
                    "-"
                  ) : (
                    <button type="button" className="button-secondary" onClick={() => handleReconcile(row.id)}>
                      {t("reconciliation.reconcile")}
                    </button>
                  )}
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
