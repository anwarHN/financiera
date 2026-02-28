import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PaymentRegisterModal from "../components/PaymentRegisterModal";
import RowActionsMenu from "../components/RowActionsMenu";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import {
  createSaleReturnTransaction,
  getTransactionById,
  listPaymentsForTransaction,
  listReturnableSaleDetails,
  listTransactionDetails
} from "../services/transactionsService";
import { formatDate } from "../utils/dateFormat";
import { formatNumber } from "../utils/numberFormat";

function TransactionDetailPage({ moduleType }) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { canCreate, canUpdate } = useModulePermissions("transactions");
  const { id } = useParams();
  const [transaction, setTransaction] = useState(null);
  const [details, setDetails] = useState([]);
  const [payments, setPayments] = useState([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [returnReferenceNumber, setReturnReferenceNumber] = useState("");
  const [returnDescription, setReturnDescription] = useState("");
  const [returnLines, setReturnLines] = useState([]);
  const [isReturnSaving, setIsReturnSaving] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const showTaxDiscountDetail = moduleType === "sale";
  const canRegisterReturn = moduleType === "sale" && (canCreate || canUpdate);

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
  const hasReturnableLines = returnLines.some((line) => Number(line.maxReturnableQuantity || 0) > 0);

  const openReturnModal = async () => {
    try {
      setError("");
      const rows = await listReturnableSaleDetails(id);
      setReturnLines(
        rows.map((row) => ({
          ...row,
          quantityToReturn: 0
        }))
      );
      setReturnDate(new Date().toISOString().slice(0, 10));
      setReturnReferenceNumber(transaction?.referenceNumber || "");
      setReturnDescription(`Devolución factura #${id}`);
      setIsReturnModalOpen(true);
    } catch {
      setError(t("common.genericLoadError"));
    }
  };

  const updateReturnLineQuantity = (lineId, value) => {
    setReturnLines((prev) =>
      prev.map((line) => {
        if (Number(line.id) !== Number(lineId)) return line;
        const safeValue = Math.max(Number(value || 0), 0);
        return {
          ...line,
          quantityToReturn: Math.min(safeValue, Number(line.maxReturnableQuantity || 0))
        };
      })
    );
  };

  const handleSubmitReturn = async (event) => {
    event.preventDefault();
    if (!user?.id || !transaction?.id) return;
    const lines = returnLines
      .filter((line) => Number(line.quantityToReturn || 0) > 0)
      .map((line) => ({
        sourceDetailId: Number(line.id),
        conceptId: Number(line.conceptId),
        quantity: Number(line.quantityToReturn || 0)
      }));
    if (!lines.length) {
      setError(t("inventory.returns.invalidQuantity"));
      return;
    }
    try {
      setIsReturnSaving(true);
      await createSaleReturnTransaction({
        saleTransactionId: Number(transaction.id),
        returnDate,
        referenceNumber: returnReferenceNumber,
        description: returnDescription,
        lines,
        userId: user.id
      });
      setIsReturnModalOpen(false);
      await loadData();
      setError("");
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setIsReturnSaving(false);
    }
  };

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
          {canRegisterReturn ? (
            <div className="table-actions-inline">
              <RowActionsMenu
                actions={[
                  {
                    key: "register-return",
                    label: t("inventory.returns.register"),
                    onClick: openReturnModal,
                    disabled: !transaction
                  }
                ]}
              />
            </div>
          ) : null}
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

      {isReturnModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card modal-card-wide" onClick={(event) => event.stopPropagation()}>
            <form className="crud-form" onSubmit={handleSubmitReturn}>
              <h3>{t("inventory.returns.register")}</h3>
              <div className="form-grid-2">
                <label className="field-block">
                  <span>{t("transactions.date")}</span>
                  <input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} required />
                </label>
                <label className="field-block">
                  <span>{t("transactions.referenceNumber")}</span>
                  <input value={returnReferenceNumber} onChange={(event) => setReturnReferenceNumber(event.target.value)} />
                </label>
                <label className="field-block form-span-2">
                  <span>{t("transactions.description")}</span>
                  <input value={returnDescription} onChange={(event) => setReturnDescription(event.target.value)} />
                </label>
              </div>

              <section className="generic-panel">
                <p>
                  ID: {transaction?.id ?? "-"} | {t("transactions.person")}: {transaction?.persons?.name ?? "-"} | {t("transactions.total")}:{" "}
                  {formatNumber(transaction?.total || 0)}
                </p>
              </section>

              <table className="crud-table">
                <thead>
                  <tr>
                    <th>{t("transactions.product")}</th>
                    <th className="num-col">{t("transactions.quantity")}</th>
                    <th className="num-col">{t("inventory.returns.returnedQuantity")}</th>
                    <th className="num-col">{t("inventory.returns.maxReturnableQuantity")}</th>
                    <th className="num-col">{t("inventory.returns.quantityToReturn")}</th>
                  </tr>
                </thead>
                <tbody>
                  {returnLines.length === 0 ? (
                    <tr>
                      <td colSpan={5}>{t("common.empty")}</td>
                    </tr>
                  ) : (
                    returnLines.map((line) => (
                      <tr key={`return-line-${line.id}`}>
                        <td>{line.conceptName || "-"}</td>
                        <td className="num-col">
                          {formatNumber(line.quantity || 0, { showCurrency: false, minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="num-col">
                          {formatNumber(line.alreadyReturnedQuantity || 0, {
                            showCurrency: false,
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2
                          })}
                        </td>
                        <td className="num-col">
                          {formatNumber(line.maxReturnableQuantity || 0, {
                            showCurrency: false,
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2
                          })}
                        </td>
                        <td className="num-col">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.quantityToReturn}
                            onChange={(event) => updateReturnLineQuantity(line.id, event.target.value)}
                            disabled={Number(line.maxReturnableQuantity || 0) <= 0}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="crud-form-actions">
                <button type="button" className="button-secondary" onClick={() => setIsReturnModalOpen(false)}>
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={isReturnSaving || !hasReturnableLines} className={isReturnSaving ? "is-saving" : ""}>
                  {isReturnSaving ? t("common.loading") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TransactionDetailPage;
