import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import ConceptModuleFormPage from "./ConceptModuleFormPage";
import RowActionsMenu from "../components/RowActionsMenu";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import { deleteConcept, listConceptsByModule } from "../services/conceptsService";
import { formatNumber } from "../utils/numberFormat";

const pageSize = 10;

function ConceptModulePage({ moduleType, titleKey, basePath }) {
  const { t } = useI18n();
  const { account } = useAuth();
  const { canCreate, canUpdate } = useModulePermissions("concepts");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const isCreateModalOpen = searchParams.get("create") === "1" && canCreate;
  const editId = searchParams.get("edit");
  const isEditModalOpen = Boolean(editId) && canUpdate;

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

  const closeModal = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    next.delete("edit");
    setSearchParams(next);
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
                {moduleType === "products" && <th>{t("concepts.productType")}</th>}
                {moduleType === "products" && <th>{t("concepts.taxPercentage")}</th>}
                {moduleType === "products" && <th>{t("transactions.price")}</th>}
                {moduleType === "products" && <th>{t("transactions.additionalCharges")}</th>}
                {moduleType === "products" && <th className="num-col">{t("products.stock")}</th>}
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.parentConcept?.name ?? "-"}</td>
                  {moduleType === "products" && <td>{item.productType === "service" ? t("concepts.productTypeService") : t("concepts.productTypeProduct")}</td>}
                  {moduleType === "products" && <td>{formatNumber(item.taxPercentage || 0, { showCurrency: false })}</td>}
                  {moduleType === "products" && <td>{formatNumber(item.price || 0)}</td>}
                  {moduleType === "products" && <td>{formatNumber(item.additionalCharges || 0)}</td>}
                  {moduleType === "products" && (
                    <td className="num-col">{formatNumber(item.stock || 0, { showCurrency: false, minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  )}
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        ...(item.isSystem || !canUpdate
                          ? []
                          : [
                              {
                                key: "edit",
                                label: t("common.edit"),
                                onClick: () => {
                                  const next = new URLSearchParams(searchParams);
                                  next.set("edit", String(item.id));
                                  next.delete("create");
                                  setSearchParams(next);
                                }
                              }
                            ]),
                        ...(item.isSystem || !canUpdate
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

      {isCreateModalOpen || isEditModalOpen ? (
        <div
          className="modal-backdrop"
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
              itemId={isEditModalOpen ? editId : null}
              onCancel={closeModal}
              onCreated={async () => {
                await loadData();
                closeModal();
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ConceptModulePage;
