import { useMemo } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { FiCreditCard, FiMail, FiSettings, FiShield, FiUserPlus } from "react-icons/fi";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";
import OnboardingHelpButton from "../components/OnboardingHelpButton";

const accountTabs = [
  { path: "/account/billing", key: "accountManage.billing", icon: FiCreditCard },
  { path: "/account/users", key: "accountManage.users", icon: FiUserPlus },
  { path: "/account/profiles", key: "accountManage.profiles", icon: FiShield },
  { path: "/account/invitations", key: "accountManage.invitations", icon: FiMail },
  { path: "/account/settings", key: "accountManage.settings", icon: FiSettings }
];

function AccountManagePage() {
  const { t } = useI18n();
  const { account } = useAuth();
  const { pathname } = useLocation();

  const activeTab = useMemo(
    () => accountTabs.find((item) => pathname.startsWith(item.path)) ?? accountTabs[0],
    [pathname]
  );

  if (account && !account.isOriginalAccount) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="account-manage-shell">
      <section className="account-manage-content">
        <nav className="app-menu account-app-menu">
          <div className="app-menu-primary">
            {accountTabs.map((item) => (
              <NavLink key={item.path} to={item.path} className={({ isActive }) => `app-menu-entry ${isActive ? "active" : ""}`}>
                {t(item.key)}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="workspace-body single-column">
          <section className="generic-panel module-panel-shell">
            <OnboardingHelpButton moduleId="account" />
            <Outlet />
          </section>
        </div>
      </section>
    </div>
  );
}

export default AccountManagePage;
