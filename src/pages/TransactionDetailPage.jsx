import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PaymentRegisterModal from "../components/PaymentRegisterModal";
import StatusBadge from "../components/StatusBadge";
import LoadingSkeleton from "../components/LoadingSkeleton";
import ReadOnlyField from "../components/form/ReadOnlyField";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import {
  getTransactionById,
  listPaymentsForTransaction,
  listTransactionDetails,
  voidPaymentForTransaction
} from "../services/transactionsService";
import { formatDate } from "../utils/dateFormat";
import { formatNumber } from "../utils/numberFormat";

function TransactionDetailPage({ moduleType, backPath: backPathOverride = null }) {
  const { t, language } = useI18n();
  const { canVoidTransactions } = useAuth();
  const { id } = useParams();
  const [transaction, setTransaction] = useState(null);
  const [details, setDetails] = useState([]);
  const [payments, setPayments] = useState([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const showTaxDiscountDetail = moduleType === "sale";

  const backPath = backPathOverride || (moduleType === "sale" ? "/sales" : "/purchases");

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

  const handleVoidPayment = async (payment) => {
    try {
      await voidPaymentForTransaction({
        paymentTransactionId: payment.transactionId,
        paidTransactionId: id
      });
      await loadData();
      setError("");
    } catch (err) {
      setError(err?.message || t("common.genericSaveError"));
    }
  };

  if (isLoading) return <LoadingSkeleton lines={5} />;

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
          <div className="transaction-detail-summary-grid">
            <ReadOnlyField label="ID" value={transaction.id} type="number" numberOptions={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }} />
            <ReadOnlyField label={t("transactions.person")} value={transaction.persons?.name ?? ""} />
            <ReadOnlyField label={t("transactions.total")} value={transaction.total} type="currency" />
            <ReadOnlyField label={t("transactions.balance")} value={transaction.balance} type="currency" />
            <ReadOnlyField label={t("transactions.date")} value={transaction.date} type="date" />
            <ReadOnlyField label={t("transactions.referenceNumber")} value={transaction.referenceNumber || ""} />
            {showTaxDiscountDetail ? (
              <>
                <ReadOnlyField label={t("transactions.tax")} value={taxesTotal} type="currency" />
                <ReadOnlyField label={t("transactions.discount")} value={discountsTotal} type="currency" />
              </>
            ) : null}
            {transaction.deliveryAddress ? (
              <ReadOnlyField
                label={t("transactions.comments")}
                value={transaction.deliveryAddress}
                type="multiline"
                className="form-span-4"
              />
            ) : null}
          </div>
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
              <th>{t("common.status")}</th>
              <th className="num-col">{t("transactions.total")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td colSpan={6}>{t("common.empty")}</td>
              </tr>
            ) : (
              payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="num-col">{payment.transactionId}</td>
                  <td>{formatDate(payment.transactions?.date, language)}</td>
                  <td>{payment.transactions?.referenceNumber ?? "-"}</td>
                  <td>
                    <StatusBadge tone={payment.transactions?.isActive === false ? "muted" : "success"}>
                      {payment.transactions?.isActive === false ? t("common.inactive") : t("common.active")}
                    </StatusBadge>
                  </td>
                  <td className="num-col">{formatNumber(payment.total)}</td>
                  <td>
                    {canVoidTransactions ? (
                      <button
                        type="button"
                        className="button-link-secondary"
                        disabled={payment.transactions?.isActive === false}
                        onClick={() => handleVoidPayment(payment)}
                      >
                        {t("transactions.voidPayment")}
                      </button>
                    ) : null}
                  </td>
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
