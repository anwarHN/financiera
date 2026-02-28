import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PaymentRegisterModal from "../components/PaymentRegisterModal";
import { useI18n } from "../contexts/I18nContext";
import { getTransactionById, listPaymentsForTransaction, listTransactionDetails } from "../services/transactionsService";
import { formatDate } from "../utils/dateFormat";
import { formatNumber } from "../utils/numberFormat";

function TransactionDetailPage({ moduleType }) {
  const { t, language } = useI18n();
  const { id } = useParams();
  const [transaction, setTransaction] = useState(null);
  const [details, setDetails] = useState([]);
  const [payments, setPayments] = useState([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const showTaxDiscountDetail = moduleType === "sale";

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

  const taxesTotal = details.reduce((acc, line) => acc + Number(line.tax || 0), 0);
  const discountsTotal = details.reduce((acc, line) => acc + Number(line.discount || 0), 0);

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
            {t("transactions.total")}: {formatNumber(transaction.total)}
          </p>
          {showTaxDiscountDetail ? (
            <>
              <p>
                {t("transactions.tax")}: {formatNumber(taxesTotal)}
              </p>
              <p>
                {t("transactions.discount")}: {formatNumber(discountsTotal)}
              </p>
            </>
          ) : null}
          <p>
            {t("transactions.balance")}: {formatNumber(transaction.balance)}
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
              <th className="num-col">{t("transactions.quantity")}</th>
              <th className="num-col">{t("transactions.price")}</th>
              {showTaxDiscountDetail ? <th className="num-col">{t("transactions.taxPercentage")}</th> : null}
              {showTaxDiscountDetail ? <th className="num-col">{t("transactions.tax")}</th> : null}
              {showTaxDiscountDetail ? <th className="num-col">{t("transactions.discountPercentage")}</th> : null}
              {showTaxDiscountDetail ? <th className="num-col">{t("transactions.discount")}</th> : null}
              <th className="num-col">{t("transactions.total")}</th>
            </tr>
          </thead>
          <tbody>
            {details.length === 0 ? (
              <tr>
                <td colSpan={showTaxDiscountDetail ? 8 : 4}>{t("common.empty")}</td>
              </tr>
            ) : (
              details.map((line) => (
                <tr key={line.id}>
                  <td>{line.concepts?.name ?? "-"}</td>
                  <td className="num-col">{line.quantity}</td>
                  <td className="num-col">{formatNumber(line.price)}</td>
                  {showTaxDiscountDetail ? <td className="num-col">{formatNumber(line.taxPercentage || 0, { showCurrency: false })}</td> : null}
                  {showTaxDiscountDetail ? <td className="num-col">{formatNumber(line.tax || 0)}</td> : null}
                  {showTaxDiscountDetail ? <td className="num-col">{formatNumber(line.discountPercentage || 0, { showCurrency: false })}</td> : null}
                  {showTaxDiscountDetail ? <td className="num-col">{formatNumber(line.discount || 0)}</td> : null}
                  <td className="num-col">{formatNumber(line.total)}</td>
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
                <th className="num-col">ID</th>
                <th>{t("transactions.date")}</th>
                <th>{t("transactions.referenceNumber")}</th>
                <th className="num-col">{t("transactions.total")}</th>
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
                  <td className="num-col">{payment.transactionId}</td>
                  <td>{formatDate(payment.transactions?.date, language)}</td>
                  <td>{payment.transactions?.referenceNumber ?? "-"}</td>
                  <td className="num-col">{formatNumber(payment.total)}</td>
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
