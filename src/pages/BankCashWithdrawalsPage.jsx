import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import BankCashWithdrawalFormPage from "./BankCashWithdrawalFormPage";
import RowActionsMenu from "../components/RowActionsMenu";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import { deactivateCashWithdrawal, listCashWithdrawals } from "../services/transactionsService";
import { formatDate } from "../utils/dateFormat";
import { formatNumber } from "../utils/numberFormat";

const pageSize = 10;

function BankCashWithdrawalsPage() {
  const { t, language } = useI18n();
  const { account } = useAuth();
  const { canCreate, canUpdate, canVoidTransactions } = useModulePermissions("transactions");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const isCreateModalOpen = searchParams.get("create") === "1" && canCreate;

  useEffect(() => {
    if (!account?.accountId) return;
    loadData();
  }, [account?.accountId]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await listCashWithdrawals(account.accountId);
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
      await deactivateCashWithdrawal(id);
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  return (
    <div className="module-page">
      <h1>{t("bankCashWithdrawals.title")}</h1>
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
                <th className="num-col">ID</th>
                <th className="num-col">{t("bankTransfers.sourceTransactionId")}</th>
                <th>{t("transactions.date")}</th>
                <th>{t("common.name")}</th>
                <th>{t("bankCashWithdrawals.fromBankAccount")}</th>
                <th>{t("bankCashWithdrawals.toCash")}</th>
                <th>{t("transactions.referenceNumber")}</th>
                <th className="num-col">{t("transactions.total")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id}>
                  <td className="num-col">{item.id}</td>
                  <td className="num-col">{item.sourceTransactionId || "-"}</td>
                  <td>{formatDate(item.date, language)}</td>
                  <td>{item.name || "-"}</td>
                  <td>{item.deliverTo || "-"}</td>
                  <td>{item.deliveryAddress || item.account_payment_forms?.name || "-"}</td>
                  <td>{item.referenceNumber || "-"}</td>
                  <td className="num-col">{formatNumber(item.total)}</td>
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        ...(canVoidTransactions || canUpdate
                          ? [{
                              key: "deactivate",
                              label: t("transactions.deactivate"),
                              onClick: () => handleDeactivate(item.id),
                              danger: true
                            }]
                          : [])
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} />
        </>
      )}

      {isCreateModalOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            next.delete("create");
            setSearchParams(next);
          }}
        >
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <BankCashWithdrawalFormPage
              embedded
              onCancel={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("create");
                setSearchParams(next);
              }}
              onCreated={async () => {
                await loadData();
                const next = new URLSearchParams(searchParams);
                next.delete("create");
                setSearchParams(next);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default BankCashWithdrawalsPage;
