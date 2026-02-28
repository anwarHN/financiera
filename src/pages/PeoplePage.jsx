import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import PeopleFormPage from "./PeopleFormPage";
import RowActionsMenu from "../components/RowActionsMenu";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import { deletePerson, getPersonById, listPersonAccountTransactions, listPersonsByType } from "../services/personsService";
import { formatDate } from "../utils/dateFormat";
import { formatNumber } from "../utils/numberFormat";

const pageSize = 10;

function PeoplePage({ personType, titleKey, basePath }) {
  const { t, language } = useI18n();
  const { account } = useAuth();
  const { canCreate, canUpdate } = useModulePermissions(personType === 1 ? "clients" : "providers");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [detailTab, setDetailTab] = useState("open");
  const [detailPerson, setDetailPerson] = useState(null);
  const [detailRows, setDetailRows] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const isCreateModalOpen = searchParams.get("create") === "1" && canCreate;
  const editId = searchParams.get("edit");
  const isEditModalOpen = Boolean(editId) && canUpdate;
  const detailId = searchParams.get("detail");
  const isDetailModalOpen = Boolean(detailId);
  const accountKind = personType === 1 ? "receivable" : "payable";
  const openBalanceRows = useMemo(() => detailRows.filter((row) => Number(row.balance || 0) > 0), [detailRows]);
  const historyRows = useMemo(() => detailRows.filter((row) => Number(row.balance || 0) <= 0), [detailRows]);

  useEffect(() => {
    if (!account?.accountId) {
      return;
    }

    loadData();
  }, [account?.accountId, personType]);

  useEffect(() => {
    if (!account?.accountId || !detailId) return;
    loadDetail(detailId);
  }, [account?.accountId, detailId, personType]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await listPersonsByType(account.accountId, personType);
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
      await deletePerson(id);
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  const loadDetail = async (personId) => {
    try {
      setDetailLoading(true);
      const numericId = Number(personId);
      const localItem = items.find((item) => Number(item.id) === numericId);
      const [personData, transactions] = await Promise.all([
        localItem ? Promise.resolve(localItem) : getPersonById(numericId),
        listPersonAccountTransactions(account.accountId, numericId, accountKind)
      ]);
      setDetailPerson(personData ?? null);
      setDetailRows(transactions);
      setDetailTab("open");
      setDetailError("");
    } catch {
      setDetailError(t("common.genericLoadError"));
      setDetailPerson(null);
      setDetailRows([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    next.delete("edit");
    next.delete("detail");
    setSearchParams(next);
  };

  const typeLabel = (type) => {
    if (type === 1) return t("reports.sales");
    if (type === 2) return t("reports.expenses");
    if (type === 4) return t("nav.purchases");
    return t("reports.incomes");
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
                <th>{t("common.phone")}</th>
                <th>{t("common.address")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.phone ?? "-"}</td>
                  <td>{item.address ?? "-"}</td>
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
                        {
                          key: "detail",
                          label: t("actions.viewDetail"),
                          onClick: () => {
                            const next = new URLSearchParams(searchParams);
                            next.set("detail", String(item.id));
                            next.delete("create");
                            next.delete("edit");
                            setSearchParams(next);
                          }
                        },
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
                        ...(canUpdate ? [{ key: "delete", label: t("common.delete"), onClick: () => handleDelete(item.id), danger: true }] : [])
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
            <PeopleFormPage
              embedded
              personType={personType}
              titleKey={personType === 1 ? "actions.newClient" : "actions.newProvider"}
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

      {isDetailModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card modal-card-wide" onClick={(event) => event.stopPropagation()}>
            <div className="people-detail-header">
              <h3>{t("persons.accountDetailTitle")}</h3>
              <button type="button" className="action-btn" onClick={closeModal}>
                {t("common.cancel")}
              </button>
            </div>

            {detailError ? <p className="error-text">{detailError}</p> : null}
            {detailLoading ? (
              <p>{t("common.loading")}</p>
            ) : (
              <>
                <div className="people-detail-meta">
                  <p>
                    <strong>{t("common.name")}:</strong> {detailPerson?.name || "-"}
                  </p>
                  <p>
                    <strong>{t("common.phone")}:</strong> {detailPerson?.phone || "-"}
                  </p>
                  <p>
                    <strong>{t("common.address")}:</strong> {detailPerson?.address || "-"}
                  </p>
                </div>

                <div className="people-detail-tabs" role="tablist" aria-label={t("persons.accountDetailTabs")}>
                  <button
                    type="button"
                    className={`action-btn ${detailTab === "open" ? "main" : ""}`}
                    onClick={() => setDetailTab("open")}
                  >
                    {t("persons.accountsWithBalance")}
                  </button>
                  <button
                    type="button"
                    className={`action-btn ${detailTab === "history" ? "main" : ""}`}
                    onClick={() => setDetailTab("history")}
                  >
                    {t("persons.accountsHistory")}
                  </button>
                </div>

                <table className="crud-table">
                  <thead>
                    <tr>
                      <th className="num-col">ID</th>
                      <th>{t("transactions.date")}</th>
                      <th>{t("common.type")}</th>
                      <th className="num-col">{t("transactions.total")}</th>
                      <th className="num-col">{t("transactions.paymentsApplied")}</th>
                      <th className="num-col">{t("transactions.balance")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailTab === "open" ? openBalanceRows : historyRows).length === 0 ? (
                      <tr>
                        <td colSpan={6}>{t("common.empty")}</td>
                      </tr>
                    ) : (
                      (detailTab === "open" ? openBalanceRows : historyRows).map((row) => (
                        <tr key={`person-account-${detailTab}-${row.id}`}>
                          <td className="num-col">{row.id}</td>
                          <td>{formatDate(row.date, language)}</td>
                          <td>{typeLabel(Number(row.type || 0))}</td>
                          <td className="num-col">{formatNumber(row.total || 0)}</td>
                          <td className="num-col">{formatNumber(row.payments || 0)}</td>
                          <td className="num-col">{formatNumber(row.balance || 0)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default PeoplePage;
