import { useEffect, useMemo, useState } from "react";
import Pagination from "../components/Pagination";
import RowActionsMenu from "../components/RowActionsMenu";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { createProfile, listProfiles, updateProfile } from "../services/profilesService";

const pageSize = 10;

const initialForm = {
  name: "",
  canCreateUsers: false,
  canCreateProfiles: false,
  canVoidTransactions: false,
  permissions: {
    transactions: { read: true, create: false, update: false },
    concepts: { read: true, create: false, update: false },
    clients: { read: true, create: false, update: false },
    providers: { read: true, create: false, update: false }
  }
};

function clonePermissions(permissions) {
  return JSON.parse(JSON.stringify(permissions ?? initialForm.permissions));
}

function ProfilesPage() {
  const { t } = useI18n();
  const { account, user } = useAuth();

  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (!account?.accountId) return;
    loadData();
  }, [account?.accountId]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page]);

  const modules = ["transactions", "concepts", "clients", "providers"];
  const actions = ["read", "create", "update"];

  const loadData = async () => {
    try {
      const data = await listProfiles(account.accountId);
      setItems(data);
      setError("");
      setPage(1);
    } catch {
      setError(t("common.genericLoadError"));
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(initialForm);
    setIsFormOpen(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(initialForm);
    setIsFormOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      canCreateUsers: Boolean(item.canCreateUsers),
      canCreateProfiles: Boolean(item.canCreateProfiles),
      canVoidTransactions: Boolean(item.canVoidTransactions),
      permissions: clonePermissions(item.permissions)
    });
    setIsFormOpen(true);
  };

  const openDuplicate = (item) => {
    setEditingId(null);
    setForm({
      name: `${item.name} (copy)`,
      canCreateUsers: Boolean(item.canCreateUsers),
      canCreateProfiles: Boolean(item.canCreateProfiles),
      canVoidTransactions: Boolean(item.canVoidTransactions),
      permissions: clonePermissions(item.permissions)
    });
    setIsFormOpen(true);
  };

  const handleRootChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handlePermissionChange = (moduleKey, action, checked) => {
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [moduleKey]: {
          ...prev.permissions[moduleKey],
          [action]: checked
        }
      }
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      setError(t("common.requiredFields"));
      return;
    }
    if (!account?.accountId || !user?.id) {
      setError(t("common.requiredFields"));
      return;
    }

    const payload = {
      accountId: account.accountId,
      name: form.name.trim(),
      canCreateUsers: form.canCreateUsers,
      canCreateProfiles: form.canCreateProfiles,
      canVoidTransactions: form.canVoidTransactions,
      permissions: form.permissions,
      createdById: user.id
    };

    try {
      if (editingId) {
        await updateProfile(editingId, payload);
      } else {
        await createProfile(payload);
      }
      resetForm();
      await loadData();
    } catch {
      setError(t("common.genericSaveError"));
    }
  };

  return (
    <div className="module-page">
      <div className="page-header-row">
        <h1>{t("profiles.title")}</h1>
        <button type="button" className="button-link-primary" onClick={openCreate}>
          {t("profiles.newProfile")}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <table className="crud-table">
        <thead>
          <tr>
            <th>{t("common.name")}</th>
            <th>{t("profiles.canCreateUsers")}</th>
            <th>{t("profiles.canCreateProfiles")}</th>
            <th>{t("profiles.canVoidTransactions")}</th>
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {paginatedItems.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.canCreateUsers ? t("common.yes") : t("common.no")}</td>
              <td>{item.canCreateProfiles ? t("common.yes") : t("common.no")}</td>
              <td>{item.canVoidTransactions ? t("common.yes") : t("common.no")}</td>
              <td className="table-actions">
                <RowActionsMenu
                  actions={[
                    { key: "edit", label: t("common.edit"), onClick: () => openEdit(item) },
                    { key: "duplicate", label: t("profiles.duplicate"), onClick: () => openDuplicate(item) }
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Pagination page={page} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} />

      {isFormOpen && (
        <form className="crud-form" onSubmit={handleSubmit}>
          <h3>{editingId ? t("profiles.editProfile") : t("profiles.createProfile")}</h3>

          <div className="form-grid-2">
            <label className="field-block form-span-2">
              <span>{t("common.name")}</span>
              <input name="name" placeholder={t("common.name")} value={form.name} onChange={handleRootChange} required />
            </label>

            <label className="checkbox-field">
              <input type="checkbox" name="canCreateUsers" checked={form.canCreateUsers} onChange={handleRootChange} />
              {t("profiles.canCreateUsers")}
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                name="canCreateProfiles"
                checked={form.canCreateProfiles}
                onChange={handleRootChange}
              />
              {t("profiles.canCreateProfiles")}
            </label>
            <label className="checkbox-field form-span-2">
              <input
                type="checkbox"
                name="canVoidTransactions"
                checked={form.canVoidTransactions}
                onChange={handleRootChange}
              />
              {t("profiles.canVoidTransactions")}
            </label>
          </div>

          <table className="crud-table">
            <thead>
              <tr>
                <th>{t("profiles.module")}</th>
                <th>{t("profiles.read")}</th>
                <th>{t("profiles.write")}</th>
                <th>{t("profiles.update")}</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((moduleKey) => (
                <tr key={moduleKey}>
                  <td>{t(`profiles.modules.${moduleKey}`)}</td>
                  {actions.map((action) => (
                    <td key={action}>
                      <input
                        type="checkbox"
                        checked={Boolean(form.permissions?.[moduleKey]?.[action])}
                        onChange={(event) => handlePermissionChange(moduleKey, action, event.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="crud-form-actions">
            <button type="submit">{editingId ? t("common.update") : t("common.create")}</button>
            <button type="button" className="button-secondary" onClick={resetForm}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default ProfilesPage;
