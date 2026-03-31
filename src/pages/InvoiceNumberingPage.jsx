import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import RowActionsMenu from "../components/RowActionsMenu";
import ToggleSwitch from "../components/ToggleSwitch";
import DateField from "../components/form/DateField";
import NumberField from "../components/form/NumberField";
import SelectField from "../components/form/SelectField";
import TextField from "../components/form/TextField";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { useModulePermissions } from "../hooks/useModulePermissions";
import {
  createCorrelativeControl,
  deactivateCorrelativeControl,
  listCorrelativesControls,
  updateCorrelativeControl
} from "../services/correlativesControlService";
import { TRANSACTION_TYPES } from "../services/transactionsService";

const pageSize = 10;

const TRANSACTION_TYPE_OPTIONS = [
  { value: TRANSACTION_TYPES.sale, labelKey: "transactions.salesTitle" },
  { value: TRANSACTION_TYPES.purchase, labelKey: "transactions.purchasesTitle" }
];

const initialForm = {
  transactionType: String(TRANSACTION_TYPES.sale),
  lastNumber: "0",
  numberFrom: "1",
  numberTo: "",
  limitDate: "",
  isActive: true,
  printPattern: "",
  reference1: "",
  reference2: ""
};

function InvoiceNumberingPage() {
  const { t } = useI18n();
  const { account, user } = useAuth();
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
      transactionType: String(selected.transactionType || TRANSACTION_TYPES.sale),
      lastNumber: String(selected.lastNumber ?? 0),
      numberFrom: String(selected.numberFrom ?? 1),
      numberTo: selected.numberTo == null ? "" : String(selected.numberTo),
      limitDate: selected.limitDate || "",
      isActive: Boolean(selected.isActive),
      printPattern: selected.printPattern || "",
      reference1: selected.reference1 || "",
      reference2: selected.reference2 || ""
    });
  }, [isCreateModalOpen, isEditModalOpen, items, editId]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await listCorrelativesControls(account.accountId);
      setItems(data);
      setPage(1);
      setError("");
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

  const resolveTypeLabel = (value) => {
    const option = TRANSACTION_TYPE_OPTIONS.find((item) => Number(item.value) === Number(value));
    return option ? t(option.labelKey) : value;
  };

  const validateForm = () => {
    const lastNumber = Number(form.lastNumber || 0);
    const numberFrom = Number(form.numberFrom || 0);
    const hasNumberTo = form.numberTo !== "";
    const numberTo = hasNumberTo ? Number(form.numberTo) : null;
    const requiresManualRequiredFields = isCreateModalOpen;

    if (!Number.isFinite(lastNumber) || !Number.isFinite(numberFrom) || numberFrom <= 0) {
      return t("invoiceNumbering.invalidRange");
    }
    if (lastNumber < numberFrom - 1) {
      return t("invoiceNumbering.lastNumberTooLow");
    }
    if (hasNumberTo && (!Number.isFinite(numberTo) || numberTo < numberFrom || lastNumber > numberTo)) {
      return t("invoiceNumbering.invalidRange");
    }
    if (!form.printPattern.includes("{0}")) {
      return t("invoiceNumbering.patternPlaceholderRequired");
    }
    if (requiresManualRequiredFields && !hasNumberTo) {
      return t("common.requiredFields");
    }
    if (requiresManualRequiredFields && !form.limitDate) {
      return t("common.requiredFields");
    }
    if (requiresManualRequiredFields && !form.printPattern.trim()) {
      return t("common.requiredFields");
    }
    if (requiresManualRequiredFields && !form.reference1.trim()) {
      return t("common.requiredFields");
    }
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!account?.accountId || !user?.id) return;
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      setError(t("common.requiredFields"));
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      accountId: account.accountId,
      transactionType: Number(form.transactionType),
      lastNumber: Number(form.lastNumber),
      numberFrom: Number(form.numberFrom),
      numberTo: form.numberTo === "" ? null : Number(form.numberTo),
      limitDate: form.limitDate || null,
      isActive: Boolean(form.isActive),
      printPattern: form.printPattern.trim(),
      reference1: form.reference1.trim() || null,
      reference2: form.reference2.trim() || null
    };

    try {
      setIsSaving(true);
      if (isEditModalOpen) {
        await updateCorrelativeControl(Number(editId), payload);
      } else {
        await createCorrelativeControl({
          ...payload,
          createdById: user.id
        });
      }
      await loadData();
      closeModal();
      setError("");
    } catch (err) {
      setError(err?.message || t("common.genericSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async (itemId) => {
    try {
      await deactivateCorrelativeControl(itemId);
      await loadData();
      setError("");
    } catch (err) {
      setError(err?.message || t("common.genericSaveError"));
    }
  };

  return (
    <div className="module-page">
      <h1>{t("invoiceNumbering.title")}</h1>
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
                <th>{t("invoiceNumbering.transactionType")}</th>
                <th className="num-col">{t("invoiceNumbering.lastNumber")}</th>
                <th className="num-col">{t("invoiceNumbering.numberFrom")}</th>
                <th className="num-col">{t("invoiceNumbering.numberTo")}</th>
                <th>{t("invoiceNumbering.limitDate")}</th>
                <th>{t("invoiceNumbering.printPattern")}</th>
                <th>{t("invoiceNumbering.reference1")}</th>
                <th>{t("invoiceNumbering.reference2")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id}>
                  <td>{resolveTypeLabel(item.transactionType)}</td>
                  <td className="num-col">{item.lastNumber}</td>
                  <td className="num-col">{item.numberFrom}</td>
                  <td className="num-col">{item.numberTo ?? "-"}</td>
                  <td>{item.limitDate || "-"}</td>
                  <td>{item.printPattern}</td>
                  <td>{item.reference1 || "-"}</td>
                  <td>{item.reference2 || "-"}</td>
                  <td>
                    <StatusBadge tone={item.isActive ? "success" : "muted"}>
                      {item.isActive ? t("common.active") : t("common.inactive")}
                    </StatusBadge>
                  </td>
                  <td className="table-actions">
                    <RowActionsMenu
                      actions={[
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
                              },
                              {
                                key: "deactivate",
                                label: t("common.deactivate"),
                                onClick: () => handleDeactivate(item.id),
                                disabled: !item.isActive,
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
          <Pagination page={page} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} />
        </>
      )}

      {isCreateModalOpen || isEditModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <form className="crud-form" onSubmit={handleSubmit}>
              <h3>{isEditModalOpen ? t("invoiceNumbering.edit") : t("invoiceNumbering.new")}</h3>
              <div className="form-grid-2">
                <SelectField
                  label={t("invoiceNumbering.transactionType")}
                  name="transactionType"
                  value={form.transactionType}
                  onChange={(event) => setForm((prev) => ({ ...prev, transactionType: event.target.value }))}
                  required
                >
                  {TRANSACTION_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </SelectField>
                <NumberField
                  label={t("invoiceNumbering.lastNumber")}
                  name="lastNumber"
                  value={form.lastNumber}
                  min="0"
                  step="1"
                  onChange={(event) => setForm((prev) => ({ ...prev, lastNumber: event.target.value }))}
                  required
                />
                <NumberField
                  label={t("invoiceNumbering.numberFrom")}
                  name="numberFrom"
                  value={form.numberFrom}
                  min="1"
                  step="1"
                  onChange={(event) => setForm((prev) => ({ ...prev, numberFrom: event.target.value }))}
                  required
                />
                <NumberField
                  label={t("invoiceNumbering.numberTo")}
                  name="numberTo"
                  value={form.numberTo}
                  min="1"
                  step="1"
                  onChange={(event) => setForm((prev) => ({ ...prev, numberTo: event.target.value }))}
                  required={isCreateModalOpen}
                />
                <DateField
                  label={t("invoiceNumbering.limitDate")}
                  name="limitDate"
                  value={form.limitDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, limitDate: event.target.value }))}
                  required={isCreateModalOpen}
                />
                <TextField
                  label={t("invoiceNumbering.printPattern")}
                  name="printPattern"
                  value={form.printPattern}
                  onChange={(event) => setForm((prev) => ({ ...prev, printPattern: event.target.value }))}
                  required
                />
                <TextField
                  label={t("invoiceNumbering.reference1")}
                  name="reference1"
                  value={form.reference1}
                  onChange={(event) => setForm((prev) => ({ ...prev, reference1: event.target.value }))}
                  required={isCreateModalOpen}
                />
                <TextField
                  label={t("invoiceNumbering.reference2")}
                  name="reference2"
                  value={form.reference2}
                  onChange={(event) => setForm((prev) => ({ ...prev, reference2: event.target.value }))}
                />
                <div className="form-span-2">
                  <ToggleSwitch
                    label={t("invoiceNumbering.isActive")}
                    checked={form.isActive}
                    onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                  />
                </div>
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

export default InvoiceNumberingPage;
