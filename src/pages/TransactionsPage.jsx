import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import PaymentRegisterModal from "../components/PaymentRegisterModal";
import RowActionsMenu from "../components/RowActionsMenu";
import StatusBadge from "../components/StatusBadge";
import TransactionCreatePage from "./TransactionCreatePage";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import {
  deactivateTransaction,
  listPrimaryConceptsByTransactionIds,
  listTransactions,
  TRANSACTION_TYPES
} from "../services/transactionsService";
import { formatDate } from "../utils/dateFormat";
import { formatNumber } from "../utils/numberFormat";

const INVENTORY_ADJUSTMENT_TAG = "__inventory_adjustment__";

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
  inventoryAdjustment: {
    type: TRANSACTION_TYPES.expense,
    titleKey: "transactions.inventoryAdjustmentsTitle"
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
  const { t, language } = useI18n();
  const { account, canVoidTransactions } = useAuth();
  const { canCreate, canUpdate } = useModulePermissions("transactions");
  const config = moduleConfig[moduleType];
  const supportsTableFilters = ["sale", "purchase", "expense", "income", "inventoryAdjustment"].includes(moduleType);

  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [paymentModal, setPaymentModal] = useState({ open: false, transaction: null, direction: "incoming" });
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    person: "",
    employeeId: "",
    minAmount: "",
    maxAmount: ""
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const isCreateModalOpen = searchParams.get("create") === "1" && canCreate;
  const editId = searchParams.get("edit");
  const isEditModalOpen = Boolean(editId) && canUpdate;

  useEffect(() => {
    if (!account?.accountId) {
      return;
    }

    loadData();
  }, [account?.accountId, config.type]);

  const filteredItems = useMemo(() => {
    const personQuery = filters.person.trim().toLowerCase();
    const minAmount = filters.minAmount === "" ? null : Number(filters.minAmount);
    const maxAmount = filters.maxAmount === "" ? null : Number(filters.maxAmount);

    return items.filter((item) => {
      if (filters.dateFrom && item.date < filters.dateFrom) return false;
      if (filters.dateTo && item.date > filters.dateTo) return false;
      if (personQuery) {
        const personName = (item.persons?.name || "").toLowerCase();
        if (!personName.includes(personQuery)) return false;
      }
      if ((moduleType === "income" || moduleType === "expense") && filters.employeeId) {
        if (String(item.employeeId ?? "") !== filters.employeeId) return false;
      }
      if (Number.isFinite(minAmount) && Number(item.total || 0) < minAmount) return false;
      if (Number.isFinite(maxAmount) && Number(item.total || 0) > maxAmount) return false;
      return true;
    });
  }, [items, filters, moduleType]);

  const employeeFilterOptions = useMemo(() => {
    const unique = new Map();
    items.forEach((item) => {
      if (!item.employeeId) return;
      unique.set(String(item.employeeId), item.employes?.name || `#${item.employeeId}`);
    });
    return Array.from(unique.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await listTransactions({
        accountId: account.accountId,
        type: config.type,
        excludeInternalObligations: moduleType === "purchase",
        excludeEmployeeLoans: moduleType === "purchase"
      });
      const moduleRows =
        moduleType === "expense"
          ? data.filter((row) => !(Array.isArray(row.tags) && row.tags.includes(INVENTORY_ADJUSTMENT_TAG)))
          : moduleType === "inventoryAdjustment"
            ? data.filter((row) => Array.isArray(row.tags) && row.tags.includes(INVENTORY_ADJUSTMENT_TAG))
            : data;
      if (moduleType === "income" || moduleType === "expense") {
        const conceptByTxId = await listPrimaryConceptsByTransactionIds(moduleRows.map((row) => row.id));
        setItems(
          moduleRows.map((row) => ({
            ...row,
            conceptName: conceptByTxId[Number(row.id)] ?? "-"
          }))
        );
      } else {
        setItems(moduleRows);
      }
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

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => {
    setFilters({
      dateFrom: "",
      dateTo: "",
      person: "",
      employeeId: "",
      minAmount: "",
      maxAmount: ""
    });
  };

  const closeModal = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    next.delete("edit");
    setSearchParams(next);
  };

  return (
    <div className="module-page">
      <h1>{t(config.titleKey)}</h1>
      {supportsTableFilters && (
        <details className="generic-panel filters-accordion">
          <summary className="filters-accordion-summary">{t("reports.applicableFilters")}</summary>
          <div className="filters-accordion-body">
            <div className="transaction-filters-grid">
              <label className="field-block">
                <span>{t("reports.dateFrom")}</span>
                <input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleFilterChange} />
              </label>
              <label className="field-block">
                <span>{t("reports.dateTo")}</span>
                <input type="date" name="dateTo" value={filters.dateTo} onChange={handleFilterChange} />
              </label>
              <label className="field-block">
                <span>{t("transactions.person")}</span>
                <input
                  type="text"
                  name="person"
                  value={filters.person}
                  onChange={handleFilterChange}
                  placeholder={`-- ${t("transactions.person")} --`}
                />
              </label>
              {(moduleType === "income" || moduleType === "expense") && (
                <label className="field-block">
                  <span>{t("transactions.employee")}</span>
                  <select name="employeeId" value={filters.employeeId} onChange={handleFilterChange}>
                    <option value="">{`-- ${t("common.all")} --`}</option>
                    {employeeFilterOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field-block">
                <span>{t("transactions.minAmount")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  name="minAmount"
                  value={filters.minAmount}
                  onChange={handleFilterChange}
                  placeholder={`-- ${t("transactions.minAmount")} --`}
                />
              </label>
              <label className="field-block">
                <span>{t("transactions.maxAmount")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  name="maxAmount"
                  value={filters.maxAmount}
                  onChange={handleFilterChange}
                  placeholder={`-- ${t("transactions.maxAmount")} --`}
                />
              </label>
            </div>
            <div className="crud-form-actions">
              <button type="button" className="button-secondary" onClick={clearFilters}>
                {t("common.clearFilters")}
              </button>
            </div>
          </div>
        </details>
      )}

      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : filteredItems.length === 0 ? (
        <p>{t("common.empty")}</p>
      ) : (
        <>
          <table className="crud-table">
            <thead>
              <tr>
                <th className="num-col">ID</th>
                <th>{t("transactions.date")}</th>
                <th>{t("common.name")}</th>
                <th>{t("transactions.tags")}</th>
                {(moduleType === "income" || moduleType === "expense") && <th>{t("transactions.concept")}</th>}
                <th>{t("transactions.person")}</th>
                {(moduleType === "income" || moduleType === "expense") && <th>{t("transactions.employee")}</th>}
                <th>{t("projects.project")}</th>
                <th className="num-col">{t("transactions.total")}</th>
                <th className="num-col">{t("transactions.balance")}</th>
                <th>{t("transactions.referenceNumber")}</th>
                <th>{t("transactions.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id}>
                  <td className="num-col">
                    {moduleType === "sale" || moduleType === "purchase" ? (
                      <Link to={`/${moduleType === "sale" ? "sales" : "purchases"}/${item.id}`}>{item.id}</Link>
                    ) : (
                      item.id
                    )}
                  </td>
                  <td>{formatDate(item.date, language)}</td>
                  <td>{item.name ?? "-"}</td>
                  <td>
                    {Array.isArray(item.tags) && item.tags.filter((tag) => tag !== INVENTORY_ADJUSTMENT_TAG).length > 0 ? (
                      <div className="table-tags">
                        {item.tags
                          .filter((tag) => tag !== INVENTORY_ADJUSTMENT_TAG)
                          .map((tag, index) => (
                          <span key={`${item.id}-tag-${index}`} className="table-tag-pill">
                            {tag}
                          </span>
                          ))}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  {(moduleType === "income" || moduleType === "expense") && <td>{item.conceptName ?? "-"}</td>}
                  <td>{item.persons?.name ?? "-"}</td>
                  {(moduleType === "income" || moduleType === "expense") && <td>{item.employes?.name ?? "-"}</td>}
                  <td>{item.projects?.name ?? "-"}</td>
                  <td className="num-col">{formatNumber(item.total)}</td>
                  <td className="num-col">{formatNumber(item.balance)}</td>
                  <td>{item.referenceNumber ?? "-"}</td>
                  <td>
                    <StatusBadge tone={item.isActive ? "success" : "muted"}>
                      {item.isActive ? t("transactions.active") : t("transactions.inactive")}
                    </StatusBadge>
                  </td>
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
                        ...(["sale", "purchase", "expense", "income"].includes(moduleType) && canUpdate
                          ? [
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
                            ]
                          : []),
                        ...(canVoidTransactions
                          ? [{
                          key: "deactivate",
                          label: t("transactions.deactivate"),
                          onClick: () => handleDeactivate(item.id),
                          disabled: !item.isActive,
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

          <Pagination page={page} pageSize={pageSize} totalItems={filteredItems.length} onPageChange={setPage} />
          <PaymentRegisterModal
            isOpen={paymentModal.open}
            transaction={paymentModal.transaction}
            direction={paymentModal.direction}
            onClose={() => setPaymentModal({ open: false, transaction: null, direction: "incoming" })}
            onSaved={loadData}
          />
        </>
      )}

      {isCreateModalOpen || isEditModalOpen ? (
        <div
          className="modal-backdrop"
        >
          <div className={`modal-card ${["sale", "purchase", "inventoryAdjustment"].includes(moduleType) ? "modal-card-wide" : ""}`} onClick={(event) => event.stopPropagation()}>
            <TransactionCreatePage
              embedded
              moduleType={moduleType}
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

export default TransactionsPage;
