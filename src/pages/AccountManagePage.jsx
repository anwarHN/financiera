import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { FiCreditCard, FiMail, FiSettings, FiShield, FiUserPlus } from "react-icons/fi";
import { useI18n } from "../contexts/I18nContext";
import { useAuth } from "../contexts/AuthContext";

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
  const [isCompactMenu, setIsCompactMenu] = useState(window.matchMedia("(max-width: 980px)").matches);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const menuPrimaryRef = useRef(null);

  const activeTab = useMemo(
    () => accountTabs.find((item) => pathname.startsWith(item.path)) ?? accountTabs[0],
    [pathname]
  );

  const visibleTabs = isCompactMenu ? [activeTab] : accountTabs;
  const overflowTabs = isCompactMenu ? accountTabs.filter((item) => item.path !== activeTab.path) : [];

  useEffect(() => {
    const onResize = () => {
      const isMobile = window.matchMedia("(max-width: 980px)").matches;
      if (!isMobile && menuPrimaryRef.current) {
        const overflows = menuPrimaryRef.current.scrollWidth > menuPrimaryRef.current.clientWidth + 2;
        setIsCompactMenu(overflows);
      } else {
        setIsCompactMenu(isMobile);
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const closeOverflow = () => setIsOverflowOpen(false);
    window.addEventListener("click", closeOverflow);
    return () => window.removeEventListener("click", closeOverflow);
  }, []);

  if (account && !account.isOriginalAccount) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="account-manage-shell">
      <section className="account-manage-content">
        <nav className="app-menu account-app-menu">
          <div className="app-menu-primary" ref={menuPrimaryRef}>
            {visibleTabs.map((item) => (
              <NavLink key={item.path} to={item.path} className={({ isActive }) => `app-menu-entry ${isActive ? "active" : ""}`}>
                {t(item.key)}
              </NavLink>
            ))}
          </div>
          {overflowTabs.length > 0 ? (
            <div className="account-menu-overflow-wrap" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="action-btn overflow-trigger-btn"
                onClick={() => setIsOverflowOpen((prev) => !prev)}
              >
                {t("common.more")}
              </button>
              {isOverflowOpen ? (
                <div className="account-menu-overflow-dropdown">
                  {overflowTabs.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) => `panel-action ${isActive ? "active" : ""}`}
                      onClick={() => setIsOverflowOpen(false)}
                    >
                      {t(item.key)}
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
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
