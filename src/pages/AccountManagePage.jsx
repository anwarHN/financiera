import { NavLink, Outlet } from "react-router-dom";
import { FiCreditCard, FiSettings, FiShield, FiUserPlus } from "react-icons/fi";
import { useI18n } from "../contexts/I18nContext";

const accountTabs = [
  { path: "/account/billing", key: "accountManage.billing", icon: FiCreditCard },
  { path: "/account/users", key: "accountManage.users", icon: FiUserPlus },
  { path: "/account/profiles", key: "accountManage.profiles", icon: FiShield },
  { path: "/account/settings", key: "accountManage.settings", icon: FiSettings }
];

function AccountManagePage() {
  const { t } = useI18n();

  return (
    <div className="account-manage-shell">
      <section className="account-manage-content">
        <nav className="app-menu">
          <div className="app-menu-primary">
            {accountTabs.map((item) => (
              <NavLink key={item.path} to={item.path} className={({ isActive }) => `app-menu-entry ${isActive ? "active" : ""}`}>
                {t(item.key)}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="workspace-body single-column">
          <section className="generic-panel">
            <Outlet />
          </section>
        </div>
      </section>
    </div>
  );
}

export default AccountManagePage;
