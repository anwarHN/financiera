import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FiBell,
  FiBarChart2,
  FiBox,
  FiCalendar,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiCreditCard,
  FiDollarSign,
  FiFileText,
  FiFolder,
  FiHome,
  FiGitMerge,
  FiLayers,
  FiList,
  FiMoon,
  FiPackage,
  FiPlus,
  FiShare2,
  FiUser,
  FiSearch,
  FiSun,
  FiTrendingDown,
  FiTrendingUp,
  FiUserCheck,
  FiUsers
} from "react-icons/fi";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { searchGlobalByAccount } from "../services/globalSearchService";
import { listPendingInvitationsForCurrentUser } from "../services/invitationsService";
import { formatDate } from "../utils/dateFormat";
import ModuleOnboarding from "./ModuleOnboarding";

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
    id: "appointments",
    titleKey: "nav.appointments",
    icon: FiCalendar,
    items: [
      { path: "/appointments/calendar", key: "nav.appointmentsCalendar", icon: FiCalendar },
      { path: "/appointments/by-employee", key: "nav.appointmentsByEmployee", icon: FiUsers },
      { path: "/appointments/table", key: "nav.appointmentsTable", icon: FiList }
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
      { path: "/bank-transfers", key: "nav.bankTransfers", icon: FiShare2 },
      { path: "/internal-obligations", key: "nav.internalObligations", icon: FiFileText },
      { path: "/bank-reconciliation", key: "nav.bankReconciliation", icon: FiGitMerge }
    ]
  },
  {
    id: "planning",
    titleKey: "nav.planning",
    icon: FiFolder,
    items: [
      { path: "/projects", key: "nav.projects", icon: FiFolder },
      { path: "/budgets", key: "nav.budgets", icon: FiFileText }
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

function resolveTransactionSearchTarget(row) {
  if (row.type === 1) return `/sales/${row.id}`;
  if (row.type === 4) return `/purchases/${row.id}`;
  if (row.type === 2) return "/expenses";
  if (row.type === 3) return "/incomes";
  if (row.type === 5) return "/purchases";
  if (row.type === 6) return "/sales";
  return "/";
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
  const [accountPanelStyle, setAccountPanelStyle] = useState({});
  const [notificationsPanelStyle, setNotificationsPanelStyle] = useState({});
  const [userPanelStyle, setUserPanelStyle] = useState({});
  const [searchPanelStyle, setSearchPanelStyle] = useState({});
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState({
    transactions: [],
    clients: [],
    providers: [],
    products: [],
    concepts: [],
    deposits: []
  });
  const [isSearching, setIsSearching] = useState(false);
  const [isMobile980, setIsMobile980] = useState(window.matchMedia("(max-width: 980px)").matches);
  const [isMobile620, setIsMobile620] = useState(window.matchMedia("(max-width: 620px)").matches);
  const [isAppMenuCompact, setIsAppMenuCompact] = useState(false);
  const [isActionsCompact, setIsActionsCompact] = useState(false);
  const [isSidebarForcedCollapsed, setIsSidebarForcedCollapsed] = useState(false);

  const appMenuPrimaryRef = useRef(null);
  const actionsPrimaryRef = useRef(null);
  const sidebarMobileBtnRef = useRef(null);
  const appMenuOverflowBtnRef = useRef(null);
  const actionsOverflowBtnRef = useRef(null);
  const desktopSearchWrapRef = useRef(null);
  const mobileSearchBtnRef = useRef(null);
  const accountSwitchBtnRef = useRef(null);
  const notificationsBtnRef = useRef(null);
  const userMenuBtnRef = useRef(null);

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

  useEffect(() => {
    let isMounted = true;
    const loadPendingInvitations = async () => {
      if (!user?.id) {
        setPendingInvitations([]);
        return;
      }
      try {
        const data = await listPendingInvitationsForCurrentUser();
        if (isMounted) {
          setPendingInvitations(data);
        }
      } catch {
        if (isMounted) {
          setPendingInvitations([]);
        }
      }
    };

    loadPendingInvitations();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;
    const normalized = searchTerm.trim();

    if (!account?.accountId || normalized.length < 2) {
      setIsSearching(false);
      setSearchResults({
        transactions: [],
        clients: [],
        providers: [],
        products: [],
        concepts: [],
        deposits: []
      });
      return () => {
        isMounted = false;
      };
    }

    const timerId = window.setTimeout(async () => {
      try {
        setIsSearching(true);
        const data = await searchGlobalByAccount({
          accountId: account.accountId,
          term: normalized,
          limit: 8
        });
        if (isMounted) {
          setSearchResults(data);
        }
      } catch {
        if (isMounted) {
          setSearchResults({
            transactions: [],
            clients: [],
            providers: [],
            products: [],
            concepts: [],
            deposits: []
          });
        }
      } finally {
        if (isMounted) {
          setIsSearching(false);
        }
      }
    }, 280);

    return () => {
      isMounted = false;
      window.clearTimeout(timerId);
    };
  }, [account?.accountId, searchTerm]);

  const selectedGroup = navGroups.find((group) => group.id === selectedGroupId) ?? null;
  const isAccountRoute = pathname.startsWith("/account");

  const actionsConfig = useMemo(() => {
    if (pathname.startsWith("/clients")) return { createPath: "/clients?create=1", createLabel: t("actions.newClient") };
    if (pathname.startsWith("/providers")) {
      return { createPath: "/providers?create=1", createLabel: t("actions.newProvider") };
    }
    if (pathname.startsWith("/employees")) {
      return { createPath: "/employees?create=1", createLabel: t("actions.newEmployee") };
    }
    if (pathname.startsWith("/appointments")) {
      return { createPath: `${pathname}?create=1`, createLabel: t("actions.newAppointment") };
    }
    if (pathname.startsWith("/products")) return { createPath: "/products?create=1", createLabel: t("actions.newProduct") };
    if (pathname.startsWith("/payment-forms")) {
      return { createPath: "/payment-forms?create=1", createLabel: t("actions.newPaymentForm") };
    }
    if (pathname.startsWith("/bank-deposits")) {
      return { createPath: "/bank-deposits?create=1", createLabel: t("actions.newBankDeposit") };
    }
    if (pathname.startsWith("/bank-transfers")) {
      return { createPath: "/bank-transfers?create=1", createLabel: t("actions.newBankTransfer") };
    }
    if (pathname.startsWith("/internal-obligations")) {
      return { createPath: "/internal-obligations?create=1", createLabel: t("actions.newInternalObligation") };
    }
    if (pathname.startsWith("/income-concepts")) {
      return { createPath: "/income-concepts?create=1", createLabel: t("actions.newIncomeConcept") };
    }
    if (pathname.startsWith("/expense-concepts")) {
      return { createPath: "/expense-concepts?create=1", createLabel: t("actions.newExpenseConcept") };
    }
    if (pathname.startsWith("/concept-groups")) {
      return { createPath: "/concept-groups?create=1", createLabel: t("actions.newConceptGroup") };
    }
    if (pathname.startsWith("/sales")) return { createPath: "/sales?create=1", createLabel: t("actions.newSale") };
    if (pathname.startsWith("/purchases")) return { createPath: "/purchases?create=1", createLabel: t("actions.newPurchase") };
    if (pathname.startsWith("/expenses")) return { createPath: "/expenses?create=1", createLabel: t("actions.newExpense") };
    if (pathname.startsWith("/incomes")) return { createPath: "/incomes?create=1", createLabel: t("actions.newIncome") };
    if (pathname.startsWith("/projects")) return { createPath: "/projects?create=1", createLabel: t("actions.newProject") };
    if (pathname.startsWith("/budgets")) return { createPath: "/budgets?create=1", createLabel: t("actions.newBudget") };
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
  const hasSearchTerm = searchTerm.trim().length >= 2;
  const searchGroups = useMemo(
    () => [
      {
        key: "transactions",
        title: t("sidebar.transactions"),
        rows: (searchResults.transactions ?? []).map((row) => ({
          id: `tx-${row.id}`,
          title: row.name || `${t("sidebar.transactions")} #${row.id}`,
          subtitle: `${formatDate(row.date, language)} · ${row.referenceNumber || "-"}`,
          to: resolveTransactionSearchTarget(row)
        }))
      },
      {
        key: "clients",
        title: t("nav.clients"),
        rows: (searchResults.clients ?? []).map((row) => ({
          id: `client-${row.id}`,
          title: row.name || `#${row.id}`,
          subtitle: row.phone || row.address || "-",
          to: "/clients"
        }))
      },
      {
        key: "providers",
        title: t("nav.providers"),
        rows: (searchResults.providers ?? []).map((row) => ({
          id: `provider-${row.id}`,
          title: row.name || `#${row.id}`,
          subtitle: row.phone || row.address || "-",
          to: "/providers"
        }))
      },
      {
        key: "products",
        title: t("nav.products"),
        rows: (searchResults.products ?? []).map((row) => ({
          id: `product-${row.id}`,
          title: row.name || `#${row.id}`,
          subtitle: `ID ${row.id}`,
          to: "/products"
        }))
      },
      {
        key: "concepts",
        title: t("sidebar.concepts"),
        rows: (searchResults.concepts ?? []).map((row) => ({
          id: `concept-${row.id}`,
          title: row.name || `#${row.id}`,
          subtitle: `ID ${row.id}`,
          to: "/concept-groups"
        }))
      },
      {
        key: "deposits",
        title: t("nav.bankDeposits"),
        rows: (searchResults.deposits ?? []).map((row) => ({
          id: `deposit-${row.id}`,
          title: row.name || `${t("nav.bankDeposits")} #${row.id}`,
          subtitle: `${formatDate(row.date, language)} · ${row.referenceNumber || "-"}`,
          to: "/bank-deposits"
        }))
      }
    ],
    [searchResults, t, language]
  );
  const totalSearchRows = useMemo(
    () => searchGroups.reduce((sum, group) => sum + group.rows.length, 0),
    [searchGroups]
  );

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
      if (openPanel === "account-switch") {
        setAccountPanelStyle(positionPanelUnderButton(accountSwitchBtnRef.current));
      }
      if (openPanel === "notifications") {
        setNotificationsPanelStyle(positionPanelUnderButton(notificationsBtnRef.current));
      }
      if (openPanel === "search") {
        const searchAnchor = isMobile980 ? mobileSearchBtnRef.current : desktopSearchWrapRef.current;
        setSearchPanelStyle(positionPanelUnderButton(searchAnchor));
      }
      if (openPanel === "user") {
        setUserPanelStyle(positionPanelUnderButton(userMenuBtnRef.current));
      }
    };

    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [openToolbarPanel, openPanel, selectedGroup, isMobile980]);

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

  const handleLogout = async () => {
    await logout();
  };

  const togglePanel = (panelName, event) => {
    event.stopPropagation();
    if (panelName === "account-switch") {
      setAccountPanelStyle(positionPanelUnderButton(accountSwitchBtnRef.current));
    }
    if (panelName === "notifications") {
      setNotificationsPanelStyle(positionPanelUnderButton(notificationsBtnRef.current));
    }
    if (panelName === "search") {
      const searchAnchor = isMobile980 ? mobileSearchBtnRef.current : desktopSearchWrapRef.current;
      setSearchPanelStyle(positionPanelUnderButton(searchAnchor));
    }
    if (panelName === "user") {
      setUserPanelStyle(positionPanelUnderButton(userMenuBtnRef.current));
    }
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

        <label
          className="search-wrap"
          htmlFor="global-search"
          ref={desktopSearchWrapRef}
          onClick={(event) => {
            event.stopPropagation();
            const searchAnchor = isMobile980 ? mobileSearchBtnRef.current : desktopSearchWrapRef.current;
            setSearchPanelStyle(positionPanelUnderButton(searchAnchor));
            setOpenPanel("search");
            setOpenToolbarPanel(null);
          }}
        >
          <span className="search-icon">
            <FiSearch />
          </span>
          <input
            id="global-search"
            type="text"
            placeholder={t("common.searchPlaceholder")}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onFocus={(event) => {
              event.stopPropagation();
              const searchAnchor = isMobile980 ? mobileSearchBtnRef.current : desktopSearchWrapRef.current;
              setSearchPanelStyle(positionPanelUnderButton(searchAnchor));
              setOpenPanel("search");
              setOpenToolbarPanel(null);
            }}
          />
        </label>

        <div className="topbar-right">
          <button
            className="icon-btn mobile-search-btn"
            ref={mobileSearchBtnRef}
            onClick={(event) => togglePanel("search", event)}
            aria-label={t("common.searchPlaceholder")}
          >
            <FiSearch />
          </button>
          <button className="icon-btn" onClick={() => navigate("/")} aria-label={t("nav.dashboard")}>
            <FiHome />
          </button>
          <button
            className="account-switch-btn"
            ref={accountSwitchBtnRef}
            data-tour="topbar-account-switch"
            onClick={(event) => togglePanel("account-switch", event)}
            aria-label={t("topbar.currentAccount")}
            title={t("topbar.currentAccount")}
          >
            {account?.accountName || t("topbar.currentAccount")}
          </button>
          <button
            className="icon-btn"
            ref={notificationsBtnRef}
            onClick={(event) => togglePanel("notifications", event)}
            aria-label={t("topbar.notifications")}
          >
            <FiBell />
            {pendingInvitations.length > 0 ? <span className="notification-dot" /> : null}
          </button>
          <div className="user-menu-wrap">
            <button
              className="avatar-btn"
              ref={userMenuBtnRef}
              data-tour="user-menu-button"
              onClick={(event) => togglePanel("user", event)}
              aria-label={t("topbar.userMenu")}
            >
              <FiUser />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`floating-panel panel-right panel-anchor search-results-panel ${openPanel === "search" ? "open" : ""}`}
        style={searchPanelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{t("common.searchPlaceholder")}</h3>
        {isMobile980 ? (
          <label className="search-wrap search-wrap-panel" htmlFor="global-search-mobile">
            <span className="search-icon">
              <FiSearch />
            </span>
            <input
              id="global-search-mobile"
              type="text"
              placeholder={t("common.searchPlaceholder")}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
        ) : null}
        <div className="search-results-content">
          {!hasSearchTerm ? (
            <p className="search-empty-state">{t("common.searchTypeToStart")}</p>
          ) : isSearching ? (
            <p className="search-empty-state">{t("common.searching")}</p>
          ) : totalSearchRows === 0 ? (
            <p className="search-empty-state">{t("common.searchNoResults")}</p>
          ) : (
            searchGroups.map((group) =>
              group.rows.length > 0 ? (
                <section key={group.key} className="search-result-group">
                  <h4>{group.title}</h4>
                  <div className="search-result-list">
                    {group.rows.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className="search-result-item"
                        onClick={() => {
                          navigate(row.to);
                          setOpenPanel(null);
                        }}
                      >
                        <span className="search-result-title">{row.title}</span>
                        <span className="search-result-subtitle">{row.subtitle}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null
            )
          )}
        </div>
      </div>

      <div
        className={`floating-panel panel-right panel-anchor ${openPanel === "notifications" ? "open" : ""}`}
        style={notificationsPanelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{t("topbar.notifications")}</h3>
        <ul className="panel-list">
          {pendingInvitations.length > 0 ? (
            <>
              <li>
                {t("topbar.pendingInvitations")} ({pendingInvitations.length})
              </li>
              <li>
                <button
                  type="button"
                  className="panel-action"
                  onClick={() => {
                    navigate("/account/invitations");
                    setOpenPanel(null);
                  }}
                >
                  <FiList /> {t("topbar.goToInvitations")}
                </button>
              </li>
            </>
          ) : (
            <li>{t("topbar.noNotifications")}</li>
          )}
        </ul>
      </div>

      <div
        className={`floating-panel panel-right panel-anchor ${openPanel === "account-switch" ? "open" : ""}`}
        style={accountPanelStyle}
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
                  window.location.assign("/");
                }}
              >
                {!row.isOriginalAccount ? <FiShare2 /> : null}
                {row.accountName || `${t("topbar.currentAccount")} #${row.accountId}`}
              </button>
            ))
          )}
        </div>
      </div>

      <div
        className={`floating-panel panel-right panel-anchor ${openPanel === "user" ? "open" : ""}`}
        style={userPanelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <h3>{t("topbar.account")}</h3>
        <ul className="panel-list">
          <li>{user?.email}</li>
          {account?.isOriginalAccount ? (
            <li className="panel-section-separator">
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
          ) : null}
          <li>
            <button
              type="button"
              className="panel-action"
              onClick={() => setIsDarkTheme((prev) => !prev)}
              aria-label={t("topbar.theme")}
            >
              {isDarkTheme ? <FiSun /> : <FiMoon />} {t("topbar.theme")}
            </button>
          </li>
          <li>
            <label className="field-block">
              <span>{t("common.language")}</span>
              <select id="language-select" value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option value="es">ES</option>
                <option value="en">EN</option>
              </select>
            </label>
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
          <aside
            className={`sidebar-icons ${isSidebarForcedCollapsed ? "force-collapsed" : ""}`}
            data-tour="sidebar-icons"
          >
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={() => setIsSidebarForcedCollapsed((prev) => !prev)}
              aria-label={isSidebarForcedCollapsed ? t("common.expand") : t("common.collapse")}
              title={isSidebarForcedCollapsed ? t("common.expand") : t("common.collapse")}
            >
              <span className="side-icon-glyph">{isSidebarForcedCollapsed ? <FiChevronRight /> : <FiChevronLeft />}</span>
              <span className="side-icon-label">{isSidebarForcedCollapsed ? t("common.expand") : t("common.collapse")}</span>
            </button>
            {navGroups.map((group) => {
              const isActiveGroup = selectedGroupId === group.id;
              const firstPath = group.items?.[0]?.path ?? "/";

              return (
                <div key={group.id} className="sidebar-group">
                  <NavLink
                    to={firstPath}
                    end={firstPath === "/"}
                    className={`side-icon group-root ${isActiveGroup ? "active" : ""}`}
                    onClick={() => {
                      setSelectedGroupId(group.id);
                    }}
                  >
                    <span className="side-icon-glyph">
                      <group.icon />
                    </span>
                    <span className="side-icon-label">{t(group.titleKey)}</span>
                  </NavLink>
                </div>
              );
            })}
          </aside>
        )}

        <section className={`workspace ${isAccountRoute ? "account-mode" : ""}`}>
          {shouldShowAppMenu && (
            <div className="app-menu" data-tour="app-menu">
              {isMobile980 ? (
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
              ) : null}

              <div className="app-menu-primary" ref={appMenuPrimaryRef}>
                {selectedGroup?.items.map((item, index) => {
                  const isOverflowable = index > 0;
                  const hideInCompact = isAppMenuCompact && isOverflowable && !isMobile980;

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
                className="action-btn overflow-trigger-btn"
                ref={appMenuOverflowBtnRef}
                onClick={(event) => {
                  event.stopPropagation();
                  openToolbarAnchorPanel("appmenu-overflow", appMenuOverflowBtnRef.current);
                }}
                aria-label="Más opciones de menú"
                style={{ display: !isMobile980 && isAppMenuCompact && appMenuOverflowItems.length > 0 ? "inline-flex" : "none" }}
                
              >
                <span className="overflow-more-btn">{t("common.more")} <FiChevronDown /></span>
              </button>
            </div>
          )}

          {!isAccountRoute && (
            <div className="actions-menu" data-tour="actions-menu">
              <div className="actions-primary" ref={actionsPrimaryRef}>
                {actionItems.map((item) => {
                  const hideInCompact = isActionsCompact && item.overflowable;
                  if (hideInCompact) return null;

                  if (item.type === "link") {
                    return (
                      <Link key={item.key} to={item.to} className={`action-btn ${item.main ? "main" : ""}`}>
                        {item.main ? <FiPlus /> : null}
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
              <button
                type="button"
                className="action-btn overflow-trigger-btn"
                ref={actionsOverflowBtnRef}
                onClick={(event) => {
                  event.stopPropagation();
                  openToolbarAnchorPanel("actions-overflow", actionsOverflowBtnRef.current);
                }}
                aria-label="Más acciones"
                style={{ display: isActionsCompact && actionOverflowItems.length > 0 ? "inline-flex" : "none" }}
              >
                <span className="overflow-more-btn">{t("common.more")} <FiChevronDown /></span>
              </button>
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
                    const firstPath = group.items?.[0]?.path;
                    if (firstPath && pathname !== firstPath) {
                      navigate(firstPath);
                    }
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

          <div className="workspace-body single-column" data-tour="workspace">
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
      <ModuleOnboarding />
    </div>
  );
}

export default Layout;
