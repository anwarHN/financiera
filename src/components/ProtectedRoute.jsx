import { Navigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";

function ProtectedRoute({ children }) {
  const { user, account, isLoading } = useAuth();
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
  const hasPaidMembership = account?.billingStatus === "active";
  const canAccessWithoutMembership = location.pathname.startsWith("/account");

  if (isTrialExpired && !hasPaidMembership && !canAccessWithoutMembership) {
    return <Navigate to="/account/billing" replace />;
  }

  return children;
}

export default ProtectedRoute;
