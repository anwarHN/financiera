import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FiBell,
  FiBarChart2,
  FiBox,
  FiChevronRight,
  FiCreditCard,
  FiDollarSign,
  FiFileText,
  FiHome,
  FiGitMerge,
  FiLayers,
  FiList,
  FiMoon,
  FiPackage,
  FiSearch,
  FiSun,
  FiTrendingDown,
  FiTrendingUp,
  FiUserCheck,
  FiUsers
} from "react-icons/fi";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";

const navGroups = [
  {
    id: "core",
    titleKey: "sidebar.core",
    icon: FiBox,
    items: [
      { path: "/", key: "nav.dashboard", icon: FiBox },
      { path: "/clients", key: "nav.clients", icon: FiUsers },
      { path: "/providers", key: "nav.providers", icon: FiPackage },
      { path: "/employees", key: "nav.employees", icon: FiUserCheck }
    ]
  },
  {
    id: "products",
    titleKey: "nav.products",
    icon: FiPackage,
    items: [{ path: "/products", key: "nav.products", icon: FiPackage }]
  },
  {
    id: "transactions",
    titleKey: "sidebar.transactions",
    icon: FiDollarSign,
    items: [
      { path: "/sales", key: "nav.sales", icon: FiFileText },
      { path: "/purchases", key: "nav.purchases", icon: FiPackage },
      { path: "/expenses", key: "nav.expenses", icon: FiTrendingDown },
      { path: "/incomes", key: "nav.incomes", icon: FiDollarSign }
    ]
  },
  {
    id: "concepts",
    titleKey: "sidebar.concepts",
    icon: FiLayers,
    items: [
      { path: "/income-concepts", key: "nav.incomeConcepts", icon: FiTrendingUp },
      { path: "/expense-concepts", key: "nav.expenseConcepts", icon: FiTrendingDown },
      { path: "/payable-concepts", key: "nav.payableConcepts", icon: FiFileText },
      { path: "/concept-groups", key: "nav.conceptGroups", icon: FiLayers }
    ]
  },
  {
    id: "payments",
    titleKey: "nav.paymentForms",
    icon: FiCreditCard,
    items: [
      { path: "/payment-forms", key: "nav.paymentForms", icon: FiCreditCard },
      { path: "/bank-deposits", key: "nav.bankDeposits", icon: FiDollarSign },
      { path: "/internal-obligations", key: "nav.internalObligations", icon: FiFileText },
      { path: "/bank-reconciliation", key: "nav.bankReconciliation", icon: FiGitMerge }
    ]
  },
  {
    id: "reports",
    titleKey: "nav.reports",
    icon: FiBarChart2,
    items: [{ path: "/reports", key: "nav.reports", icon: FiBarChart2 }]
  }
];

function resolveGroupByPath(pathname) {
  if (pathname === "/") return "core";

  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.path !== "/" && pathname.startsWith(item.path)) {
        return group.id;
      }
    }
  }

  return null;
}

function Layout() {
  const { logout, user, account, accounts, switchAccount } = useAuth();
  const { t, language, setLanguage } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [isDarkTheme, setIsDarkTheme] = useState(() => localStorage.getItem("theme") === "dark");
  const [textSize, setTextSize] = useState(() => localStorage.getItem("textSize") || "md");
  const [density, setDensity] = useState(() => localStorage.getItem("density") || "comfortable");
  const [selectedGroupId, setSelectedGroupId] = useState(() => resolveGroupByPath(window.location.pathname));
  const [openPanel, setOpenPanel] = useState(null);
  const [openToolbarPanel, setOpenToolbarPanel] = useState(null);
  const [toolbarPanelStyle, setToolbarPanelStyle] = useState({});
  const [isMobile980, setIsMobile980] = useState(window.matchMedia("(max-width: 980px)").matches);
  const [isMobile620, setIsMobile620] = useState(window.matchMedia("(max-width: 620px)").matches);
  const [isAppMenuCompact, setIsAppMenuCompact] = useState(false);
  const [isActionsCompact, setIsActionsCompact] = useState(false);

  const appMenuPrimaryRef = useRef(null);
  const actionsPrimaryRef = useRef(null);
  const sidebarMobileBtnRef = useRef(null);
  const appMenuOverflowBtnRef = useRef(null);
  const actionsOverflowBtnRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDarkTheme ? "dark" : "light");
    localStorage.setItem("theme", isDarkTheme ? "dark" : "light");
  }, [isDarkTheme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-text-size", textSize);
    localStorage.setItem("textSize", textSize);
  }, [textSize]);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
    localStorage.setItem("density", density);
  }, [density]);

  const selectedGroup = navGroups.find((group) => group.id === selectedGroupId) ?? null;
  const isAccountRoute = pathname.startsWith("/account");

  const actionsConfig = useMemo(() => {
    if (pathname.startsWith("/clients")) return { createPath: "/clients/new", createLabel: t("actions.newClient") };
    if (pathname.startsWith("/providers")) {
      return { createPath: "/providers/new", createLabel: t("actions.newProvider") };
    }
    if (pathname.startsWith("/employees")) {
      return { createPath: "/employees/new", createLabel: t("actions.newEmployee") };
    }
    if (pathname.startsWith("/products")) return { createPath: "/products/new", createLabel: t("actions.newProduct") };
    if (pathname.startsWith("/payment-forms")) {
      return { createPath: "/payment-forms/new", createLabel: t("actions.newPaymentForm") };
    }
    if (pathname.startsWith("/bank-deposits")) {
      return { createPath: "/bank-deposits/new", createLabel: t("actions.newBankDeposit") };
    }
    if (pathname.startsWith("/internal-obligations")) {
      return { createPath: "/internal-obligations/new", createLabel: t("actions.newInternalObligation") };
    }
    if (pathname.startsWith("/income-concepts")) {
      return { createPath: "/income-concepts/new", createLabel: t("actions.newIncomeConcept") };
    }
    if (pathname.startsWith("/expense-concepts")) {
      return { createPath: "/expense-concepts/new", createLabel: t("actions.newExpenseConcept") };
    }
    if (pathname.startsWith("/payable-concepts")) {
      return { createPath: "/payable-concepts/new", createLabel: t("actions.newPayableConcept") };
    }
    if (pathname.startsWith("/concept-groups")) {
      return { createPath: "/concept-groups/new", createLabel: t("actions.newConceptGroup") };
    }
    if (pathname.startsWith("/sales")) return { createPath: "/sales/new", createLabel: t("actions.newSale") };
    if (pathname.startsWith("/purchases")) return { createPath: "/purchases/new", createLabel: t("actions.newPurchase") };
    if (pathname.startsWith("/expenses")) return { createPath: "/expenses/new", createLabel: t("actions.newExpense") };
    if (pathname.startsWith("/incomes")) return { createPath: "/incomes/new", createLabel: t("actions.newIncome") };
    if (pathname.startsWith("/account")) return { createPath: null, createLabel: null };
    if (pathname.startsWith("/reports")) return { createPath: null, createLabel: null };

    return { createPath: null, createLabel: null };
  }, [pathname, t]);

  const actionItems = useMemo(() => {
    const items = [];
    if (actionsConfig.createPath) {
      items.push({
        key: "create",
        label: actionsConfig.createLabel,
        type: "link",
        to: actionsConfig.createPath,
        main: true,
        overflowable: false
      });
    }

    items.push({ key: "refresh", label: t("actions.refresh"), type: "button", onClick: () => window.location.reload(), overflowable: true });

    return items;
  }, [actionsConfig, t]);

  const appMenuOverflowItems = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.items.filter((_, index) => index > 0);
  }, [selectedGroup]);

  const actionOverflowItems = useMemo(() => actionItems.filter((item) => item.overflowable), [actionItems]);

  const shouldShowAppMenu = !isAccountRoute && Boolean(selectedGroup);

  const positionPanelUnderButton = (buttonEl) => {
    if (!buttonEl) return {};

    const buttonRect = buttonEl.getBoundingClientRect();
    const panelWidth = Math.min(320, window.innerWidth - 16);

    let left = buttonRect.left;
    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8;
    }
    left = Math.max(8, left);

    const top = Math.max(8, Math.min(window.innerHeight - 220, buttonRect.bottom + 8));
    const buttonCenter = buttonRect.left + buttonRect.width / 2;
    const arrowLeft = Math.max(14, Math.min(panelWidth - 20, buttonCenter - left - 7));

    return {
      left: `${left}px`,
      right: "auto",
      top: `${top}px`,
      width: `${panelWidth}px`,
      "--arrow-left": `${arrowLeft}px`
    };
  };

  const openToolbarAnchorPanel = (panelName, buttonEl) => {
    if (openToolbarPanel === panelName) {
      setOpenToolbarPanel(null);
      return;
    }

    setToolbarPanelStyle(positionPanelUnderButton(buttonEl));
    setOpenToolbarPanel(panelName);
  };

  useEffect(() => {
    const onResize = () => {
      const nextMobile980 = window.matchMedia("(max-width: 980px)").matches;
      const nextMobile620 = window.matchMedia("(max-width: 620px)").matches;
      setIsMobile980(nextMobile980);
      setIsMobile620(nextMobile620);

      if (appMenuPrimaryRef.current) {
        const compactByWidth = appMenuPrimaryRef.current.scrollWidth > appMenuPrimaryRef.current.clientWidth + 4;
        setIsAppMenuCompact(nextMobile620 || compactByWidth);
      } else {
        setIsAppMenuCompact(nextMobile620);
      }

      if (actionsPrimaryRef.current) {
        const actionsCompactByWidth = actionsPrimaryRef.current.scrollWidth > actionsPrimaryRef.current.clientWidth + 4;
        setIsActionsCompact(nextMobile620 || actionsCompactByWidth);
      } else {
        setIsActionsCompact(nextMobile620);
      }

      if (openToolbarPanel === "sidebar-mobile") {
        setToolbarPanelStyle(positionPanelUnderButton(sidebarMobileBtnRef.current));
      }
      if (openToolbarPanel === "appmenu-overflow") {
        setToolbarPanelStyle(positionPanelUnderButton(appMenuOverflowBtnRef.current));
      }
      if (openToolbarPanel === "actions-overflow") {
        setToolbarPanelStyle(positionPanelUnderButton(actionsOverflowBtnRef.current));
      }
    };

    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [openToolbarPanel, selectedGroup]);

  useEffect(() => {
    const routeGroupId = resolveGroupByPath(pathname);
    if (routeGroupId) {
      setSelectedGroupId(routeGroupId);
    }
  }, [pathname]);

  useEffect(() => {
    const closePanels = () => {
      setOpenPanel(null);
      setOpenToolbarPanel(null);
    };

    window.addEventListener("click", closePanels);
    const onKeydown = (event) => {
      if (event.key === "Escape") closePanels();
    };
    document.addEventListener("keydown", onKeydown);

    return () => {
      window.removeEventListener("click", closePanels);
      document.removeEventListener("keydown", onKeydown);
    };
  }, []);

  const userInitials = (user?.email || "U").slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    await logout();
  };

  const togglePanel = (panelName, event) => {
    event.stopPropagation();
    setOpenPanel((prev) => (prev === panelName ? null : panelName));
    setOpenToolbarPanel(null);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/" className="product-name">
            {t("common.appName")}
          </Link>
        </div>

        <label className="search-wrap" htmlFor="global-search">
          <span className="search-icon">
            <FiSearch />
          </span>
          <input id="global-search" type="text" placeholder={t("common.searchPlaceholder")} />
        </label>

        <div className="topbar-right">
          <button className="icon-btn" onClick={() => navigate("/")} aria-label={t("nav.dashboard")}>
            <FiHome />
          </button>
          <button
            className="account-switch-btn"
            onClick={(event) => togglePanel("account-switch", event)}
            aria-label={t("topbar.currentAccount")}
            title={t("topbar.currentAccount")}
          >
            {account?.accountName || t("topbar.currentAccount")}
          </button>
          <button className="icon-btn" onClick={() => setIsDarkTheme((prev) => !prev)} aria-label={t("topbar.theme")}>
            {isDarkTheme ? <FiSun /> : <FiMoon />}
          </button>
          <button
            className="icon-btn"
            onClick={(event) => togglePanel("notifications", event)}
            aria-label={t("topbar.notifications")}
          >
            <FiBell />
          </button>
          <select id="language-select" value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="es">ES</option>
            <option value="en">EN</option>
          </select>
          <div className="user-menu-wrap">
            <button
              className="avatar-btn"
              onClick={(event) => togglePanel("user", event)}
              aria-label={t("topbar.userMenu")}
            >
              {userInitials}
            </button>
          </div>
        </div>
      </header>

      <div
        className={`floating-panel panel-right ${openPanel === "notifications" ? "open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{t("topbar.notifications")}</h3>
        <ul className="panel-list">
          <li>{t("topbar.noNotifications")}</li>
        </ul>
      </div>

      <div
        className={`floating-panel panel-right ${openPanel === "account-switch" ? "open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{t("topbar.currentAccount")}</h3>
        <div className="panel-list">
          {accounts.length === 0 ? (
            <span className="panel-action disabled">{t("common.empty")}</span>
          ) : (
            accounts.map((row) => (
              <button
                key={row.accountId}
                type="button"
                className={`panel-action ${account?.accountId === row.accountId ? "active" : ""}`}
                onClick={() => {
                  switchAccount(row.accountId);
                  setOpenPanel(null);
                }}
              >
                {row.accountName || `${t("topbar.currentAccount")} #${row.accountId}`}
              </button>
            ))
          )}
        </div>
      </div>

      <div
        className={`floating-panel panel-right ${openPanel === "user" ? "open" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{t("topbar.account")}</h3>
        <ul className="panel-list">
          <li>{user?.email}</li>
          <li>
            <button
              type="button"
              className="panel-action"
              onClick={() => {
                navigate("/account");
                setOpenPanel(null);
              }}
            >
              <FiList /> {t("topbar.manageAccount")}
            </button>
          </li>
          <li>
            <label className="field-block">
              <span>{t("topbar.textSize")}</span>
              <select value={textSize} onChange={(event) => setTextSize(event.target.value)}>
                <option value="sm">{t("topbar.small")}</option>
                <option value="md">{t("topbar.medium")}</option>
                <option value="lg">{t("topbar.large")}</option>
              </select>
            </label>
          </li>
          <li>
            <label className="field-block">
              <span>{t("topbar.density")}</span>
              <select value={density} onChange={(event) => setDensity(event.target.value)}>
                <option value="compact">{t("topbar.compact")}</option>
                <option value="comfortable">{t("topbar.comfortable")}</option>
              </select>
            </label>
          </li>
          <li>
            <button type="button" className="panel-action" onClick={handleLogout}>
              {t("common.logout")}
            </button>
          </li>
        </ul>
      </div>

      <main className="content">
        {!isAccountRoute && (
          <aside className="sidebar-icons">
            {navGroups.map((group) => {
              const isActiveGroup = selectedGroupId === group.id;

              return (
                <div key={group.id} className="sidebar-group">
                  <button
                    type="button"
                    className={`side-icon group-root ${isActiveGroup ? "active" : ""}`}
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      const firstPath = group.items?.[0]?.path;
                      if (firstPath && pathname !== firstPath) {
                        navigate(firstPath);
                      }
                    }}
                  >
                    <span className="side-icon-glyph">
                      <group.icon />
                    </span>
                    <span className="side-icon-label">{t(group.titleKey)}</span>
                  </button>
                </div>
              );
            })}
          </aside>
        )}

        <section className={`workspace ${isAccountRoute ? "account-mode" : ""}`}>
          {shouldShowAppMenu && (
            <div className="app-menu">
              <button
                type="button"
                className="action-btn icon-only mobile-only"
                ref={sidebarMobileBtnRef}
                onClick={(event) => {
                  event.stopPropagation();
                  openToolbarAnchorPanel("sidebar-mobile", sidebarMobileBtnRef.current);
                }}
                aria-label="Módulos"
              >
                ☰
              </button>

              <div className="app-menu-primary" ref={appMenuPrimaryRef}>
                {selectedGroup?.items.map((item, index) => {
                  const isOverflowable = index > 0;
                  const hideInCompact = isAppMenuCompact && isOverflowable;

                  if (hideInCompact) {
                    return null;
                  }

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === "/"}
                      className={({ isActive }) => `app-menu-entry ${isActive ? "active" : ""}`}
                    >
                      {t(item.key)}
                    </NavLink>
                  );
                })}
              </div>

              <button
                type="button"
                className="action-btn icon-only"
                ref={appMenuOverflowBtnRef}
                onClick={(event) => {
                  event.stopPropagation();
                  openToolbarAnchorPanel("appmenu-overflow", appMenuOverflowBtnRef.current);
                }}
                aria-label="Más opciones de menú"
                style={{ display: isAppMenuCompact && appMenuOverflowItems.length > 0 ? "inline-flex" : "none" }}
              >
                ⋯
              </button>
            </div>
          )}

          {!isAccountRoute && (
            <div className="actions-menu">
              <button
                type="button"
                className="action-btn icon-only"
                ref={actionsOverflowBtnRef}
                onClick={(event) => {
                  event.stopPropagation();
                  openToolbarAnchorPanel("actions-overflow", actionsOverflowBtnRef.current);
                }}
                aria-label="Más acciones"
                style={{ display: isActionsCompact && actionOverflowItems.length > 0 ? "inline-flex" : "none" }}
              >
                ⋯
              </button>

              <div className="actions-primary" ref={actionsPrimaryRef}>
                {actionItems.map((item) => {
                  const hideInCompact = isActionsCompact && item.overflowable;
                  if (hideInCompact) return null;

                  if (item.type === "link") {
                    return (
                      <Link key={item.key} to={item.to} className={`action-btn ${item.main ? "main" : ""}`}>
                        {item.label}
                      </Link>
                    );
                  }

                  return (
                    <button key={item.key} type="button" className="action-btn overflowable" onClick={item.onClick}>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div
            className={`floating-panel panel-toolbar panel-anchor ${openToolbarPanel === "sidebar-mobile" ? "open" : ""}`}
            style={toolbarPanelStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Módulos</h3>
            <nav className="panel-list">
              {navGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={`panel-action ${selectedGroupId === group.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedGroupId(group.id);
                    setOpenToolbarPanel(null);
                  }}
                >
                  {t(group.titleKey)}
                </button>
              ))}
            </nav>
          </div>

          <div
            className={`floating-panel panel-toolbar panel-anchor ${openToolbarPanel === "appmenu-overflow" ? "open" : ""}`}
            style={toolbarPanelStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Menú</h3>
            <div className="panel-list">
              {appMenuOverflowItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  className={({ isActive }) => `panel-action ${isActive ? "active" : ""}`}
                  onClick={() => setOpenToolbarPanel(null)}
                >
                  {t(item.key)}
                </NavLink>
              ))}
            </div>
          </div>

          {!isAccountRoute && (
            <div
              className={`floating-panel panel-toolbar panel-anchor ${openToolbarPanel === "actions-overflow" ? "open" : ""}`}
              style={toolbarPanelStyle}
              onClick={(event) => event.stopPropagation()}
            >
              <h3>Acciones</h3>
              <div className="panel-list">
                {actionOverflowItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="panel-action"
                    onClick={() => {
                      item.onClick?.();
                      setOpenToolbarPanel(null);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="workspace-body single-column">
            {isAccountRoute ? (
              <Outlet />
            ) : (
              <section className="generic-panel">
                <Outlet />
              </section>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default Layout;
