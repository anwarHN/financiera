import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import ConceptModuleFormPage from "./ConceptModuleFormPage";
import RowActionsMenu from "../components/RowActionsMenu";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import { deleteConcept, getProductKardex, listConceptsByModule } from "../services/conceptsService";
import { formatNumber } from "../utils/numberFormat";

const pageSize = 10;
const buildInitialKardexFilters = () => {
  const today = new Date();
  const dateTo = today.toISOString().slice(0, 10);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  return { dateFrom: monthStart, dateTo };
};

function ConceptModulePage({ moduleType, titleKey, basePath }) {
  const { t } = useI18n();
  const { account } = useAuth();
  const { canCreate, canUpdate } = useModulePermissions("concepts");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const [kardexItem, setKardexItem] = useState(null);
  const [kardexFilters, setKardexFilters] = useState(buildInitialKardexFilters);
  const [kardexData, setKardexData] = useState(null);
  const [kardexError, setKardexError] = useState("");
  const [isKardexLoading, setIsKardexLoading] = useState(false);
  const isCreateModalOpen = searchParams.get("create") === "1" && canCreate;
  const editId = searchParams.get("edit");
  const isEditModalOpen = Boolean(editId) && canUpdate;
  const isKardexFiltersModalOpen = Boolean(kardexItem) && !kardexData;
  const isKardexResultModalOpen = Boolean(kardexItem) && Boolean(kardexData);

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

  const openKardexModal = (item) => {
    setKardexItem(item);
    setKardexData(null);
    setKardexError("");
    setKardexFilters(buildInitialKardexFilters());
  };

  const closeKardexModal = () => {
    setKardexItem(null);
    setKardexData(null);
    setKardexError("");
    setIsKardexLoading(false);
  };

  const handleKardexFilterChange = (event) => {
    const { name, value } = event.target;
    setKardexFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleRunKardex = async (event) => {
    event.preventDefault();
    if (!account?.accountId || !kardexItem?.id || !kardexFilters.dateFrom || !kardexFilters.dateTo) {
      setKardexError(t("common.requiredFields"));
      return;
    }
    if (kardexFilters.dateFrom > kardexFilters.dateTo) {
      setKardexError(t("products.kardexInvalidRange"));
      return;
    }

    try {
      setIsKardexLoading(true);
      const report = await getProductKardex(account.accountId, kardexItem.id, kardexFilters);
      setKardexData(report);
      setKardexError("");
    } catch {
      setKardexError(t("common.genericLoadError"));
    } finally {
      setIsKardexLoading(false);
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
                {moduleType === "products" && <th>{t("concepts.productType")}</th>}
                {moduleType === "products" && <th>{t("concepts.taxPercentage")}</th>}
                {moduleType === "products" && <th>{t("transactions.price")}</th>}
                {moduleType === "products" && <th>{t("transactions.additionalCharges")}</th>}
                {moduleType === "products" && <th className="num-col">{t("products.stock")}</th>}
                {moduleType === "products" && <th className="num-col">{t("products.pendingDelivery")}</th>}
                {moduleType === "products" && <th className="num-col">{t("products.stockFinal")}</th>}
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
                  {moduleType === "products" && (
                    <td className="num-col">
                      {formatNumber(item.pendingDelivery || 0, {
                        showCurrency: false,
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2
                      })}
                    </td>
                  )}
                  {moduleType === "products" && (
                    <td className="num-col">
                      {formatNumber(item.stockFinal || 0, { showCurrency: false, minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                  )}
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        ...(moduleType === "products"
                          ? [
                              {
                                key: "kardex",
                                label: t("products.kardexReport"),
                                onClick: () => openKardexModal(item)
                              }
                            ]
                          : []),
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

      {isKardexFiltersModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <form className="crud-form" onSubmit={handleRunKardex}>
              <section className="crud-form-section">
                <h2 className="crud-form-section-title">{t("products.kardexFiltersTitle")}</h2>
                <div className="form-grid-2">
                  <label className="field-block form-span-2">
                    <span>{t("common.name")}</span>
                    <input value={kardexItem?.name || ""} readOnly />
                  </label>
                  <label className="field-block">
                    <span>{t("reports.dateFrom")}</span>
                    <input type="date" name="dateFrom" value={kardexFilters.dateFrom} onChange={handleKardexFilterChange} required />
                  </label>
                  <label className="field-block">
                    <span>{t("reports.dateTo")}</span>
                    <input type="date" name="dateTo" value={kardexFilters.dateTo} onChange={handleKardexFilterChange} required />
                  </label>
                </div>
              </section>
              {kardexError ? <p className="error-text">{kardexError}</p> : null}
              <div className="crud-form-actions">
                <button type="button" className="button-secondary" onClick={closeKardexModal}>
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={isKardexLoading} className={isKardexLoading ? "is-saving" : ""}>
                  {isKardexLoading ? t("common.loading") : t("reports.run")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isKardexResultModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card modal-card-wide" onClick={(event) => event.stopPropagation()}>
            <div className="crud-form">
              <section className="crud-form-section">
                <h2 className="crud-form-section-title">{t("products.kardexTitle")}</h2>
                <div className="form-grid-2">
                  <label className="field-block form-span-2">
                    <span>{t("common.name")}</span>
                    <input value={kardexItem?.name || ""} readOnly />
                  </label>
                  <label className="field-block">
                    <span>{t("reports.dateFrom")}</span>
                    <input value={kardexFilters.dateFrom} readOnly />
                  </label>
                  <label className="field-block">
                    <span>{t("reports.dateTo")}</span>
                    <input value={kardexFilters.dateTo} readOnly />
                  </label>
                </div>
              </section>

              <section className="crud-form-section">
                <h2 className="crud-form-section-title">{t("products.kardexMovements")}</h2>
                <table className="crud-table">
                  <thead>
                    <tr>
                      <th>{t("transactions.date")}</th>
                      <th>{t("transactions.referenceNumber")}</th>
                      <th>{t("transactions.description")}</th>
                      <th>{t("products.kardexMovementType")}</th>
                      <th className="num-col">{t("products.kardexQuantityIn")}</th>
                      <th className="num-col">{t("products.kardexQuantityOut")}</th>
                      <th className="num-col">{t("products.kardexRunningBalance")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{kardexFilters.dateFrom}</td>
                      <td>-</td>
                      <td>{t("products.kardexPreviousBalance")}</td>
                      <td>-</td>
                      <td className="num-col">-</td>
                      <td className="num-col">-</td>
                      <td className="num-col">
                        {formatNumber(kardexData.previousBalance || 0, {
                          showCurrency: false,
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>
                    {kardexData.movements.length === 0 ? (
                      <tr>
                        <td colSpan={7}>{t("common.empty")}</td>
                      </tr>
                    ) : (
                      kardexData.movements.map((row) => (
                        <tr key={`${row.transactionId}-${row.id}`}>
                          <td>{row.date}</td>
                          <td>{row.referenceNumber || "-"}</td>
                          <td>{row.name || "-"}</td>
                          <td>{row.type === "purchase" ? t("products.kardexPurchase") : t("products.kardexSale")}</td>
                          <td className="num-col">
                            {row.quantityIn
                              ? formatNumber(row.quantityIn, { showCurrency: false, minimumFractionDigits: 0, maximumFractionDigits: 2 })
                              : "-"}
                          </td>
                          <td className="num-col">
                            {row.quantityOut
                              ? formatNumber(row.quantityOut, { showCurrency: false, minimumFractionDigits: 0, maximumFractionDigits: 2 })
                              : "-"}
                          </td>
                          <td className="num-col">
                            {formatNumber(row.balance, { showCurrency: false, minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                    <tr>
                      <td colSpan={6}><strong>{t("products.kardexTotalBalance")}</strong></td>
                      <td className="num-col">
                        <strong>
                          {formatNumber(kardexData.totalBalance || 0, {
                            showCurrency: false,
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2
                          })}
                        </strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <div className="crud-form-actions">
                <button type="button" className="button-secondary" onClick={closeKardexModal}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ConceptModulePage;
