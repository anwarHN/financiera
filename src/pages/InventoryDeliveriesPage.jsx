import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import RowActionsMenu from "../components/RowActionsMenu";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import {
  listPendingDeliveryInvoices,
  listTransactionDetails,
  registerInventoryDelivery
} from "../services/transactionsService";
import { formatDate } from "../utils/dateFormat";
import { formatNumber } from "../utils/numberFormat";

const pageSize = 10;

function InventoryDeliveriesPage() {
  const { t, language } = useI18n();
  const { account } = useAuth();
  const { canCreate, canUpdate } = useModulePermissions("transactions");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [deliveryDraft, setDeliveryDraft] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const isCreateModalOpen = searchParams.get("create") === "1" && (canCreate || canUpdate);
  const selectedInvoiceId = Number(searchParams.get("invoiceId") || 0) || null;

  useEffect(() => {
    if (!account?.accountId) return;
    loadData();
  }, [account?.accountId]);

  useEffect(() => {
    if (!isCreateModalOpen || !selectedInvoiceId) {
      setDeliveryDraft([]);
      return;
    }
    buildDraft(selectedInvoiceId);
  }, [isCreateModalOpen, selectedInvoiceId, items]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page]);

  const selectedInvoice = useMemo(
    () => items.find((row) => Number(row.id) === Number(selectedInvoiceId)) || null,
    [items, selectedInvoiceId]
  );

  const loadData = async () => {
    try {
      setIsLoading(true);
      const rows = await listPendingDeliveryInvoices(account.accountId);
      setItems(rows);
      setError("");
      setPage(1);
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const buildDraft = async (invoiceId) => {
    try {
      const details = await listTransactionDetails(invoiceId);
      const nextDraft = (details || [])
        .map((line) => {
          const quantity = Math.max(Number(line.quantity || 0), 0);
          const delivered = Math.max(Number(line.quantityDelivered || 0), 0);
          const pending = Math.max(quantity - delivered, 0);
          return {
            detailId: Number(line.id),
            conceptName: line.concepts?.name || "-",
            quantity,
            quantityDelivered: delivered,
            pendingQuantity: pending,
            quantityToDeliver: 0
          };
        })
        .filter((line) => line.pendingQuantity > 0);
      setDeliveryDraft(nextDraft);
    } catch {
      setError(t("common.genericLoadError"));
      setDeliveryDraft([]);
    }
  };

  const closeModal = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    next.delete("invoiceId");
    setSearchParams(next);
  };

  const openModalForInvoice = (invoiceId) => {
    const next = new URLSearchParams(searchParams);
    next.set("create", "1");
    next.set("invoiceId", String(invoiceId));
    setSearchParams(next);
  };

  const handleDraftChange = (detailId, value) => {
    setDeliveryDraft((prev) =>
      prev.map((line) => {
        if (line.detailId !== detailId) return line;
        const safeValue = Math.max(Number(value || 0), 0);
        return {
          ...line,
          quantityToDeliver: Math.min(safeValue, line.pendingQuantity)
        };
      })
    );
  };

  const handleSubmitDelivery = async (event) => {
    event.preventDefault();
    if (!selectedInvoiceId) return;
    const deliveries = deliveryDraft
      .filter((line) => Number(line.quantityToDeliver || 0) > 0)
      .map((line) => ({ detailId: line.detailId, quantityToDeliver: Number(line.quantityToDeliver || 0) }));
    if (!deliveries.length) {
      setError(t("inventory.deliveries.invalidQuantityToDeliver"));
      return;
    }

    try {
      setIsSaving(true);
      await registerInventoryDelivery({
        transactionId: selectedInvoiceId,
        deliveries
      });
      await loadData();
      closeModal();
      setError("");
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="module-page">
      <h1>{t("inventory.deliveries.title")}</h1>
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
                <th>{t("transactions.date")}</th>
                <th>{t("transactions.person")}</th>
                <th className="num-col">{t("transactions.total")}</th>
                <th className="num-col">{t("inventory.deliveries.pendingUnits")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((row) => (
                <tr key={row.id}>
                  <td className="num-col">{row.id}</td>
                  <td>{formatDate(row.date, language)}</td>
                  <td>{row.persons?.name || "-"}</td>
                  <td className="num-col">{formatNumber(row.total || 0)}</td>
                  <td className="num-col">
                    {formatNumber(row.pendingTotal || 0, { showCurrency: false, minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </td>
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        {
                          key: "deliver",
                          label: t("inventory.deliveries.register"),
                          onClick: () => openModalForInvoice(row.id)
                        }
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
        <div className="modal-backdrop">
          <div className="modal-card modal-card-wide" onClick={(event) => event.stopPropagation()}>
            <form className="crud-form" onSubmit={handleSubmitDelivery}>
              <h3>{t("inventory.deliveries.register")}</h3>

              <div className="form-grid-2">
                <label className="field-block form-span-2">
                  <span>{t("inventory.deliveries.invoice")}</span>
                  <select
                    value={selectedInvoiceId || ""}
                    onChange={(event) => {
                      const next = new URLSearchParams(searchParams);
                      next.set("create", "1");
                      next.set("invoiceId", event.target.value);
                      setSearchParams(next);
                    }}
                    required
                  >
                    <option value="">{`-- ${t("inventory.deliveries.selectInvoice")} --`}</option>
                    {items.map((row) => (
                      <option key={row.id} value={row.id}>
                        #{row.id} - {row.persons?.name || "-"} - {formatDate(row.date, language)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-block">
                  <span>{t("transactions.date")}</span>
                  <input value={selectedInvoice ? formatDate(selectedInvoice.date, language) : "-"} readOnly />
                </label>
                <label className="field-block">
                  <span>{t("transactions.person")}</span>
                  <input value={selectedInvoice?.persons?.name || "-"} readOnly />
                </label>
                <label className="field-block">
                  <span>{t("transactions.total")}</span>
                  <input value={selectedInvoice ? formatNumber(selectedInvoice.total || 0) : formatNumber(0)} readOnly />
                </label>
                <label className="field-block">
                  <span>{t("inventory.deliveries.pendingUnits")}</span>
                  <input
                    value={formatNumber(selectedInvoice?.pendingTotal || 0, {
                      showCurrency: false,
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2
                    })}
                    readOnly
                  />
                </label>
              </div>

              <table className="crud-table">
                <thead>
                  <tr>
                    <th>{t("transactions.product")}</th>
                    <th className="num-col">{t("transactions.quantity")}</th>
                    <th className="num-col">{t("inventory.deliveries.deliveredQuantity")}</th>
                    <th className="num-col">{t("inventory.deliveries.pendingQuantity")}</th>
                    <th className="num-col">{t("inventory.deliveries.quantityToDeliver")}</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryDraft.length === 0 ? (
                    <tr>
                      <td colSpan={5}>{t("common.empty")}</td>
                    </tr>
                  ) : (
                    deliveryDraft.map((line) => (
                      <tr key={line.detailId}>
                        <td>{line.conceptName}</td>
                        <td className="num-col">
                          {formatNumber(line.quantity || 0, { showCurrency: false, minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="num-col">
                          {formatNumber(line.quantityDelivered || 0, {
                            showCurrency: false,
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2
                          })}
                        </td>
                        <td className="num-col">
                          {formatNumber(line.pendingQuantity || 0, {
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
                            value={line.quantityToDeliver}
                            onChange={(event) => handleDraftChange(line.detailId, event.target.value)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="crud-form-actions">
                <button type="button" className="button-secondary" onClick={closeModal}>
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={isSaving || !selectedInvoiceId} className={isSaving ? "is-saving" : ""}>
                  {isSaving ? t("common.loading") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default InventoryDeliveriesPage;

