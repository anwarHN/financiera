import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import EmployeeFormPage from "./EmployeeFormPage";
import RowActionsMenu from "../components/RowActionsMenu";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { deactivateEmployee, listEmployees } from "../services/employeesService";

const pageSize = 10;

function EmployeesPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const isCreateModalOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const isEditModalOpen = Boolean(editId);

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
                  <td>{item.isPartner ? t("common.yes") : t("common.no")}</td>
                  <td>{item.isActive ? t("common.active") : t("common.inactive")}</td>
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        {
                          key: "edit",
                          label: t("common.edit"),
                          onClick: () => {
                            const next = new URLSearchParams(searchParams);
                            next.set("edit", String(item.id));
                            next.delete("create");
                            setSearchParams(next);
                          }
                        },
                        {
                          key: "deactivate",
                          label: t("common.deactivate"),
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
    </div>
  );
}

export default EmployeesPage;
