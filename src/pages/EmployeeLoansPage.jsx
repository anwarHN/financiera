import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import PaymentRegisterModal from "../components/PaymentRegisterModal";
import RowActionsMenu from "../components/RowActionsMenu";
import EmployeeLoanFormPage from "./EmployeeLoanFormPage";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import { deactivateEmployeeLoanGroup, listEmployeeLoans } from "../services/transactionsService";
import { formatDate } from "../utils/dateFormat";
import { formatNumber } from "../utils/numberFormat";

const pageSize = 10;

function EmployeeLoansPage() {
  const { t, language } = useI18n();
  const { account, canVoidTransactions } = useAuth();
  const { canCreate, canUpdate } = useModulePermissions("transactions");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const isCreateModalOpen = searchParams.get("create") === "1" && canCreate;
  const editId = searchParams.get("edit");
  const isEditModalOpen = Boolean(editId) && canUpdate;
  const [paymentModal, setPaymentModal] = useState({ open: false, transaction: null });
  const [filters, setFilters] = useState({
    employeeId: ""
  });

  useEffect(() => {
    if (!account?.accountId) return;
    loadData();
  }, [account?.accountId]);

  const filteredItems = useMemo(() => {
    if (!filters.employeeId) return items;
    return items.filter((item) => String(item.employeeId ?? "") === filters.employeeId);
  }, [items, filters.employeeId]);

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
  }, [filters.employeeId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await listEmployeeLoans(account.accountId);
      setItems(data);
      setError("");
      setPage(1);
    } catch {
      setError(t("common.genericLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    next.delete("edit");
    setSearchParams(next);
  };

  const handleDeactivate = async (id) => {
    try {
      await deactivateEmployeeLoanGroup(id);
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="module-page">
      <h1>{t("employeeLoans.title")}</h1>
      <details className="generic-panel filters-accordion">
        <summary className="filters-accordion-summary">{t("reports.applicableFilters")}</summary>
        <div className="filters-accordion-body">
          <div className="transaction-filters-grid">
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
          </div>
        </div>
      </details>
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
                <th>{t("transactions.employee")}</th>
                <th>{t("common.name")}</th>
                <th>{t("transactions.accountPaymentForm")}</th>
                <th>{t("transactions.referenceNumber")}</th>
                <th className="num-col">{t("transactions.total")}</th>
                <th className="num-col">{t("transactions.paymentsApplied")}</th>
                <th className="num-col">{t("transactions.balance")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id}>
                  <td className="num-col">{item.id}</td>
                  <td>{formatDate(item.date, language)}</td>
                  <td>{item.employes?.name || "-"}</td>
                  <td>{item.name || "-"}</td>
                  <td>{item.account_payment_forms?.name || "-"}</td>
                  <td>{item.referenceNumber || "-"}</td>
                  <td className="num-col">{formatNumber(item.total || 0)}</td>
                  <td className="num-col">{formatNumber(item.payments || 0)}</td>
                  <td className="num-col">{formatNumber(item.balance || 0)}</td>
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        ...(Number(item.balance || 0) > 0
                          ? [
                              {
                                key: "pay",
                                label: t("employeeLoans.registerPayment"),
                                onClick: () => setPaymentModal({ open: true, transaction: item })
                              }
                            ]
                          : []),
                        ...(canUpdate
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
                          ? [
                              {
                                key: "deactivate",
                                label: t("transactions.deactivate"),
                                onClick: () => handleDeactivate(item.id),
                                danger: true
                              }
                            ]
                          : [])
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={pageSize} totalItems={filteredItems.length} onPageChange={setPage} />
        </>
      )}

      {isCreateModalOpen || isEditModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <EmployeeLoanFormPage
              embedded
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

      <PaymentRegisterModal
        isOpen={paymentModal.open}
        transaction={paymentModal.transaction}
        direction="incoming"
        paymentMode="employeeLoan"
        onClose={() => setPaymentModal({ open: false, transaction: null })}
        onSaved={loadData}
      />
    </div>
  );
}

export default EmployeeLoansPage;
