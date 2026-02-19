import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import EmployeeFormPage from "./EmployeeFormPage";
import RowActionsMenu from "../components/RowActionsMenu";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { deleteEmployee, listEmployees } from "../services/employeesService";

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
      const data = await listEmployees(account.accountId);
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
      await deleteEmployee(id);
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    }
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
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        { key: "edit", label: t("common.edit"), to: `/employees/${item.id}/edit` },
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
            <EmployeeFormPage
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

export default EmployeesPage;
