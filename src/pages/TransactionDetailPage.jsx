import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PaymentRegisterModal from "../components/PaymentRegisterModal";
import { useI18n } from "../contexts/I18nContext";
import { getTransactionById, listPaymentsForTransaction, listTransactionDetails } from "../services/transactionsService";

function TransactionDetailPage({ moduleType }) {
  const { t } = useI18n();
  const { id } = useParams();
  const [transaction, setTransaction] = useState(null);
  const [details, setDetails] = useState([]);
  const [payments, setPayments] = useState([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const backPath = moduleType === "sale" ? "/sales" : "/purchases";

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [tx, txDetails, txPayments] = await Promise.all([
        getTransactionById(id),
        listTransactionDetails(id),
        listPaymentsForTransaction(id)
      ]);
      setTransaction(tx);
      setDetails(txDetails);
      setPayments(txPayments);
      setError("");
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <p>{t("common.loading")}</p>;

  return (
    <div className="module-page">
      <div className="page-header-row">
        <h1>{t("transactions.detailTitle")}</h1>
        <div className="crud-form-actions">
          <Link to={backPath} className="button-link-secondary">
            {t("common.backToList")}
          </Link>
          {Number(transaction?.balance || 0) > 0 && (
            <button type="button" className="button-link-primary" onClick={() => setIsPaymentModalOpen(true)}>
              {moduleType === "sale" ? t("transactions.newIncomingPayment") : t("transactions.newOutgoingPayment")}
            </button>
          )}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {transaction && (
        <section className="generic-panel">
          <p>ID: {transaction.id}</p>
          <p>
            {t("transactions.person")}: {transaction.persons?.name ?? "-"}
          </p>
          <p>
            {t("transactions.total")}: {Number(transaction.total || 0).toFixed(2)}
          </p>
          <p>
            {t("transactions.balance")}: {Number(transaction.balance || 0).toFixed(2)}
          </p>
          <p>
            {t("transactions.referenceNumber")}: {transaction.referenceNumber || "-"}
          </p>
        </section>
      )}

      <section className="generic-panel">
        <h3>{t("transactions.detailLines")}</h3>
        <table className="crud-table">
          <thead>
            <tr>
              <th>{t("transactions.concept")}</th>
              <th>{t("transactions.quantity")}</th>
              <th>{t("transactions.price")}</th>
              <th>{t("transactions.total")}</th>
            </tr>
          </thead>
          <tbody>
            {details.length === 0 ? (
              <tr>
                <td colSpan={4}>{t("common.empty")}</td>
              </tr>
            ) : (
              details.map((line) => (
                <tr key={line.id}>
                  <td>{line.concepts?.name ?? "-"}</td>
                  <td>{line.quantity}</td>
                  <td>{Number(line.price || 0).toFixed(2)}</td>
                  <td>{Number(line.total || 0).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="generic-panel">
        <h3>{t("transactions.paymentsApplied")}</h3>
        <table className="crud-table">
          <thead>
            <tr>
                <th>ID</th>
                <th>{t("transactions.date")}</th>
                <th>{t("transactions.referenceNumber")}</th>
                <th>{t("transactions.total")}</th>
              </tr>
            </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td colSpan={3}>{t("common.empty")}</td>
              </tr>
            ) : (
              payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.transactionId}</td>
                  <td>{payment.transactions?.date ?? "-"}</td>
                  <td>{payment.transactions?.referenceNumber ?? "-"}</td>
                  <td>{Number(payment.total || 0).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <PaymentRegisterModal
        isOpen={isPaymentModalOpen}
        transaction={transaction}
        direction={moduleType === "sale" ? "incoming" : "outgoing"}
        onClose={() => setIsPaymentModalOpen(false)}
        onSaved={loadData}
      />
    </div>
  );
}

export default TransactionDetailPage;
