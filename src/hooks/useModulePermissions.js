import { useAuth } from "../contexts/AuthContext";

export function useModulePermissions(moduleKey) {
  const { hasModulePermission, canVoidTransactions, isSystemAdmin } = useAuth();

  const canRead = hasModulePermission(moduleKey, "read");
  const canCreate = hasModulePermission(moduleKey, "create");
  const canUpdate = hasModulePermission(moduleKey, "update");

  return {
    isSystemAdmin,
    canRead,
    canCreate,
    canUpdate,
    canVoidTransactions: Boolean(canVoidTransactions)
  };
}

