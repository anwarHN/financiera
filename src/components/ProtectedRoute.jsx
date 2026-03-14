import { Navigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import AccessDeniedPage from "./AccessDeniedPage";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";

function ProtectedRoute({ children }) {
  const { user, account, isLoading, hasPathAccess, hasDashboardAccess, hasModulePermission, hasAccountSectionAccess } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (isLoading) {
    return <p className="screen-message">{t("common.loading")}</p>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const trialEndsAtMs = account?.trialEndsAt ? new Date(account.trialEndsAt).getTime() : null;
  const isTrialExpired = trialEndsAtMs ? Date.now() > trialEndsAtMs : false;
  const hasConfiguredPaymentMethod = Boolean(account?.paypalSubscriptionId || account?.stripeSubscriptionId);
  const canAccessWithoutMembership = location.pathname.startsWith("/account");

  if (isTrialExpired && !hasConfiguredPaymentMethod && !canAccessWithoutMembership) {
    return <Navigate to="/account/billing" replace />;
  }

  if (!hasPathAccess(location.pathname)) {
    let fallbackPath = "/account/settings";
    if (!location.pathname.startsWith("/account")) {
      if (hasDashboardAccess()) {
        fallbackPath = "/";
      } else if (hasModulePermission("clients", "read")) {
        fallbackPath = "/clients";
      } else if (hasModulePermission("providers", "read")) {
        fallbackPath = "/providers";
      } else if (hasModulePermission("employees", "read")) {
        fallbackPath = "/employees";
      } else if (hasModulePermission("appointments", "read")) {
        fallbackPath = "/appointments/calendar";
      } else if (hasModulePermission("concepts", "read")) {
        fallbackPath = "/products";
      } else if (hasModulePermission("transactions", "read")) {
        fallbackPath = "/sales";
      } else if (hasModulePermission("paymentForms", "read")) {
        fallbackPath = "/payment-forms";
      } else if (hasModulePermission("planning", "read")) {
        fallbackPath = "/projects";
      } else if (hasModulePermission("catalogs", "read")) {
        fallbackPath = "/currencies";
      } else if (hasModulePermission("reports", "read")) {
        fallbackPath = "/reports";
      }
    } else if (hasAccountSectionAccess("billing")) {
      fallbackPath = "/account/billing";
    }
    return <AccessDeniedPage fallbackPath={fallbackPath} />;
  }

  return children;
}

export default ProtectedRoute;
