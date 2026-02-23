import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import RowActionsMenu from "../components/RowActionsMenu";
import TextField from "../components/form/TextField";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import { createCurrency, listCurrencies, updateCurrency } from "../services/currenciesService";

const pageSize = 10;

const initialForm = {
  name: "",
  symbol: "",
  isLocal: false
};

function CurrenciesPage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const { canCreate, canUpdate } = useModulePermissions("catalogs");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(initialForm);
  const [searchParams, setSearchParams] = useSearchParams();
  const isCreateModalOpen = searchParams.get("create") === "1" && canCreate;
  const editId = searchParams.get("edit");
  const isEditModalOpen = Boolean(editId) && canUpdate;

  useEffect(() => {
    if (!account?.accountId) return;
    loadData();
  }, [account?.accountId]);

  useEffect(() => {
    if (!isCreateModalOpen && !isEditModalOpen) {
      setForm(initialForm);
      return;
    }
    if (isCreateModalOpen) {
      setForm(initialForm);
      return;
    }
    const selected = items.find((item) => String(item.id) === String(editId));
    if (!selected) return;
    setForm({
      name: selected.name || "",
      symbol: selected.symbol || "",
      isLocal: Boolean(selected.isLocal)
    });
  }, [isCreateModalOpen, isEditModalOpen, items, editId]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await listCurrencies(account.accountId);
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
    setForm(initialForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!account?.accountId) return;
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        accountId: account.accountId,
        name: form.name.trim(),
        symbol: form.symbol.trim(),
        isLocal: Boolean(form.isLocal)
      };
      if (isEditModalOpen) {
        await updateCurrency(Number(editId), payload);
      } else {
        await createCurrency(payload);
      }
      await loadData();
      closeModal();
      if (payload.isLocal) {
        localStorage.setItem("activeCurrencySymbol", payload.symbol);
      }
      setError("");
    } catch {
      setError(t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="module-page">
      <h1>{t("currencies.title")}</h1>
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
                <th>{t("currencies.symbol")}</th>
                <th>{t("currencies.isLocal")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => {
                const isOwned = Number(item.accountId) === Number(account?.accountId);
                return (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.symbol}</td>
                    <td>{item.isLocal ? t("common.yes") : t("common.no")}</td>
                    <td className="table-actions">
                      <RowActionsMenu
                        actions={[
                          ...(canUpdate && isOwned
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
                            : [])
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} />
        </>
      )}

      {isCreateModalOpen || isEditModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <form className="crud-form" onSubmit={handleSubmit}>
              <h3>{isEditModalOpen ? t("currencies.edit") : t("currencies.new")}</h3>
              <div className="form-grid-2">
                <TextField
                  label={t("common.name")}
                  name="name"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                  className="form-span-2"
                />
                <TextField
                  label={t("currencies.symbol")}
                  name="symbol"
                  value={form.symbol}
                  onChange={(event) => setForm((prev) => ({ ...prev, symbol: event.target.value }))}
                  required
                />
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={form.isLocal}
                    onChange={(event) => setForm((prev) => ({ ...prev, isLocal: event.target.checked }))}
                  />
                  {t("currencies.isLocal")}
                </label>
              </div>
              <div className="crud-form-actions">
                <button type="submit" className="action-btn main" disabled={isSaving}>
                  {isSaving ? t("common.loading") : isEditModalOpen ? t("common.update") : t("common.create")}
                </button>
                <button type="button" className="button-secondary" onClick={closeModal}>
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CurrenciesPage;
