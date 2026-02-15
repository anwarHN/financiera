import { useEffect, useMemo, useState } from "react";
import Pagination from "../components/Pagination";
import RowActionsMenu from "../components/RowActionsMenu";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { deactivateTransaction, listInternalObligations } from "../services/transactionsService";

const pageSize = 10;

function InternalAccountPayablesPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

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
      const data = await listInternalObligations(account.accountId);
      setItems(data);
      setError("");
      setPage(1);
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deactivateTransaction(id);
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  return (
    <div className="module-page">
      <h1>{t("internalObligations.title")}</h1>
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
                <th>{t("paymentForms.kind")}</th>
                <th>{t("transactions.referenceNumber")}</th>
                <th>{t("transactions.total")}</th>
                <th>{t("transactions.balance")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.date}</td>
                  <td>{item.name}</td>
                  <td>{item.account_payment_forms?.name || "-"}</td>
                  <td>{item.referenceNumber || "-"}</td>
                  <td>{Number(item.total || 0).toFixed(2)}</td>
                  <td>{Number(item.balance || 0).toFixed(2)}</td>
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        { key: "edit", label: t("common.edit"), to: `/internal-obligations/${item.id}/edit` },
                        { key: "delete", label: t("common.delete"), onClick: () => handleDelete(item.id), danger: true }
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
    </div>
  );
}

export default InternalAccountPayablesPage;
