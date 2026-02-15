import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Pagination from "../components/Pagination";
import PaymentRegisterModal from "../components/PaymentRegisterModal";
import RowActionsMenu from "../components/RowActionsMenu";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { deactivateTransaction, listTransactions, TRANSACTION_TYPES } from "../services/transactionsService";

const moduleConfig = {
  sale: {
    type: TRANSACTION_TYPES.sale,
    titleKey: "transactions.salesTitle"
  },
  expense: {
    type: TRANSACTION_TYPES.expense,
    titleKey: "transactions.expensesTitle"
  },
  income: {
    type: TRANSACTION_TYPES.income,
    titleKey: "transactions.incomesTitle"
  },
  purchase: {
    type: TRANSACTION_TYPES.purchase,
    titleKey: "transactions.purchasesTitle"
  },
  outgoingPayment: {
    type: TRANSACTION_TYPES.outgoingPayment,
    titleKey: "transactions.outgoingPaymentsTitle"
  },
  incomingPayment: {
    type: TRANSACTION_TYPES.incomingPayment,
    titleKey: "transactions.incomingPaymentsTitle"
  }
};

const pageSize = 10;

function TransactionsPage({ moduleType }) {
  const { t } = useI18n();
  const { account } = useAuth();
  const config = moduleConfig[moduleType];

  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [paymentModal, setPaymentModal] = useState({ open: false, transaction: null, direction: "incoming" });

  useEffect(() => {
    if (!account?.accountId) {
      return;
    }

    loadData();
  }, [account?.accountId, config.type]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await listTransactions({
        accountId: account.accountId,
        type: config.type,
        excludeInternalObligations: moduleType === "purchase"
      });
      setItems(data);
      setError("");
      setPage(1);
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivate = async (id) => {
    try {
      await deactivateTransaction(id);
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  return (
    <div className="module-page">
      <h1>{t(config.titleKey)}</h1>

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
                <th>ID</th>
                <th>{t("transactions.date")}</th>
                <th>{t("common.name")}</th>
                <th>{t("transactions.person")}</th>
                <th>{t("transactions.total")}</th>
                <th>{t("transactions.balance")}</th>
                <th>{t("transactions.referenceNumber")}</th>
                <th>{t("transactions.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    {moduleType === "sale" || moduleType === "purchase" ? (
                      <Link to={`/${moduleType === "sale" ? "sales" : "purchases"}/${item.id}`}>{item.id}</Link>
                    ) : (
                      item.id
                    )}
                  </td>
                  <td>{item.date}</td>
                  <td>{item.name ?? "-"}</td>
                  <td>{item.persons?.name ?? "-"}</td>
                  <td>{item.total.toFixed(2)}</td>
                  <td>{item.balance.toFixed(2)}</td>
                  <td>{item.referenceNumber ?? "-"}</td>
                  <td>{item.isActive ? t("transactions.active") : t("transactions.inactive")}</td>
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        ...(moduleType === "sale" || moduleType === "purchase"
                          ? [{ key: "detail", label: t("transactions.viewDetail"), to: `/${moduleType === "sale" ? "sales" : "purchases"}/${item.id}` }]
                          : []),
                        ...(moduleType === "purchase" && Number(item.balance || 0) > 0
                          ? [
                              {
                                key: "pay",
                                label: t("transactions.newOutgoingPayment"),
                                onClick: () => setPaymentModal({ open: true, transaction: item, direction: "outgoing" })
                              }
                            ]
                          : []),
                        ...(moduleType === "sale" && Number(item.balance || 0) > 0
                          ? [
                              {
                                key: "collect",
                                label: t("transactions.newIncomingPayment"),
                                onClick: () => setPaymentModal({ open: true, transaction: item, direction: "incoming" })
                              }
                            ]
                          : []),
                        {
                          key: "deactivate",
                          label: t("transactions.deactivate"),
                          onClick: () => handleDeactivate(item.id),
                          disabled: !item.isActive,
                          danger: true
                        }
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pagination page={page} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} />
          <PaymentRegisterModal
            isOpen={paymentModal.open}
            transaction={paymentModal.transaction}
            direction={paymentModal.direction}
            onClose={() => setPaymentModal({ open: false, transaction: null, direction: "incoming" })}
            onSaved={loadData}
          />
        </>
      )}
    </div>
  );
}

export default TransactionsPage;
