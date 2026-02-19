import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import ConceptModuleFormPage from "./ConceptModuleFormPage";
import RowActionsMenu from "../components/RowActionsMenu";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { deleteConcept, listConceptsByModule } from "../services/conceptsService";

const pageSize = 10;

function ConceptModulePage({ moduleType, titleKey, basePath }) {
  const { t } = useI18n();
  const { account } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const isCreateModalOpen = searchParams.get("create") === "1";

  useEffect(() => {
    if (!account?.accountId) {
      return;
    }

    loadData();
  }, [account?.accountId, moduleType]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await listConceptsByModule(account.accountId, moduleType);
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
      await deleteConcept(id);
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  return (
    <div className="module-page">
      <h1>{t(titleKey)}</h1>

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
                <th>{t("common.name")}</th>
                <th>{t("concepts.group")}</th>
                <th>{t("concepts.taxPercentage")}</th>
                {moduleType === "products" && <th>{t("transactions.price")}</th>}
                {moduleType === "products" && <th>{t("transactions.additionalCharges")}</th>}
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.parentConcept?.name ?? "-"}</td>
                  <td>{item.taxPercentage}</td>
                  {moduleType === "products" && <td>{Number(item.price || 0).toFixed(2)}</td>}
                  {moduleType === "products" && <td>{Number(item.additionalCharges || 0).toFixed(2)}</td>}
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        ...(item.isSystem ? [] : [{ key: "edit", label: t("common.edit"), to: `${basePath}/${item.id}/edit` }]),
                        ...(item.isSystem
                          ? []
                          : [{ key: "delete", label: t("common.delete"), onClick: () => handleDelete(item.id), danger: true }])
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
            <ConceptModuleFormPage
              embedded
              moduleType={moduleType}
              titleKey={
                moduleType === "products"
                  ? "actions.newProduct"
                  : moduleType === "income"
                    ? "actions.newIncomeConcept"
                    : moduleType === "expense"
                      ? "actions.newExpenseConcept"
                      : moduleType === "payable"
                        ? "actions.newPayableConcept"
                        : "actions.newConceptGroup"
              }
              basePath={basePath}
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

export default ConceptModulePage;
