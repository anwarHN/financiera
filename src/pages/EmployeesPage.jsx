import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import EmployeeFormPage from "./EmployeeFormPage";
import EmployeeAvailabilityModal from "../components/EmployeeAvailabilityModal";
import RowActionsMenu from "../components/RowActionsMenu";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import { deactivateEmployee, listEmployees } from "../services/employeesService";
import { formatNumber } from "../utils/numberFormat";

const pageSize = 10;

function EmployeesPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const { canCreate, canUpdate } = useModulePermissions("employees");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const isCreateModalOpen = searchParams.get("create") === "1" && canCreate;
  const editId = searchParams.get("edit");
  const availabilityId = searchParams.get("availability");
  const isEditModalOpen = Boolean(editId) && canUpdate;
  const selectedEmployeeForAvailability = useMemo(
    () => items.find((item) => String(item.id) === String(availabilityId)) || null,
    [items, availabilityId]
  );

  useEffect(() => {
    if (!account?.accountId) {
      return;
    }

    loadData();
  }, [account?.accountId]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await listEmployees(account.accountId, { includeInactive: true });
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
      await deactivateEmployee(id);
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  const closeModal = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    next.delete("edit");
    next.delete("availability");
    setSearchParams(next);
  };

  return (
    <div className="module-page">
      <h1>{t("employees.title")}</h1>
      <p>{t("employees.sensitiveHint")}</p>

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
                <th>{t("common.phone")}</th>
                <th>{t("common.email")}</th>
                <th>{t("common.address")}</th>
                <th className="num-col">{t("employees.salary")}</th>
                <th>{t("employees.isPartner")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.phone ?? "-"}</td>
                  <td>{item.email ?? "-"}</td>
                  <td>{item.address ?? "-"}</td>
                  <td className="num-col">{formatNumber(item.salary || 0)}</td>
                  <td>{item.isPartner ? t("common.yes") : t("common.no")}</td>
                  <td>
                    <StatusBadge tone={item.isActive ? "success" : "muted"}>
                      {item.isActive ? t("common.active") : t("common.inactive")}
                    </StatusBadge>
                  </td>
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        ...(canUpdate
                          ? [{
                          key: "edit",
                          label: t("common.edit"),
                          onClick: () => {
                            const next = new URLSearchParams(searchParams);
                            next.set("edit", String(item.id));
                            next.delete("create");
                            setSearchParams(next);
                          }
                        }]
                          : []),
                        {
                          key: "availability",
                          label: t("employees.availability"),
                          onClick: () => {
                            const next = new URLSearchParams(searchParams);
                            next.set("availability", String(item.id));
                            next.delete("create");
                            next.delete("edit");
                            setSearchParams(next);
                          }
                        },
                        ...(canUpdate
                          ? [{
                          key: "deactivate",
                          label: t("common.deactivate"),
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

          <Pagination page={page} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} />
        </>
      )}

      {isCreateModalOpen || isEditModalOpen ? (
        <div
          className="modal-backdrop"
        >
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <EmployeeFormPage
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

      <EmployeeAvailabilityModal
        isOpen={Boolean(selectedEmployeeForAvailability)}
        employee={selectedEmployeeForAvailability}
        onClose={closeModal}
        onSaved={loadData}
      />
    </div>
  );
}

export default EmployeesPage;
