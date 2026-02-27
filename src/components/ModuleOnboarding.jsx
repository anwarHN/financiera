import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import onboardingContent from "../config/onboardingContent.json";

const MODULES = [
  { id: "dashboard", match: (p) => p === "/" || p === "/dashboard", titleKey: "nav.dashboard" },
  { id: "clients", match: (p) => p.startsWith("/clients"), titleKey: "nav.clients" },
  { id: "providers", match: (p) => p.startsWith("/providers"), titleKey: "nav.providers" },
  { id: "employees", match: (p) => p.startsWith("/employees"), titleKey: "nav.employees" },
  {
    id: "appointments",
    match: (p) => p.startsWith("/appointments") || p.startsWith("/employee-absences"),
    titleKey: "nav.appointments"
  },
  { id: "products", match: (p) => p.startsWith("/products"), titleKey: "nav.products" },
  {
    id: "transactions",
    match: (p) => p.startsWith("/sales") || p.startsWith("/purchases") || p.startsWith("/expenses") || p.startsWith("/incomes"),
    titleKey: "sidebar.transactions"
  },
  {
    id: "payments",
    match: (p) =>
      p.startsWith("/payment-forms") ||
      p.startsWith("/cashboxes") ||
      p.startsWith("/bank-deposits") ||
      p.startsWith("/bank-transfers") ||
      p.startsWith("/bank-cash-withdrawals") ||
      p.startsWith("/internal-obligations") ||
      p.startsWith("/bank-reconciliation"),
    titleKey: "nav.paymentForms"
  },
  { id: "planning", match: (p) => p.startsWith("/projects") || p.startsWith("/budgets"), titleKey: "nav.planning" },
  {
    id: "catalogs",
    match: (p) =>
      p.startsWith("/currencies") ||
      p.startsWith("/income-concepts") ||
      p.startsWith("/expense-concepts") ||
      p.startsWith("/concept-groups"),
    titleKey: "sidebar.catalogs"
  },
  { id: "reports", match: (p) => p.startsWith("/reports"), titleKey: "nav.reports" },
  { id: "account", match: (p) => p.startsWith("/account"), titleKey: "topbar.manageAccount" }
];

function storageKey(moduleId) {
  return `module-onboarding:${moduleId}:done`;
}

function getModuleByPath(pathname) {
  return MODULES.find((module) => module.match(pathname)) ?? null;
}

function getTooltipStyle(rect) {
  if (!rect) {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)"
    };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const cardWidth = Math.min(viewportWidth * 0.94, 420);
  const cardHeight = Math.min(viewportHeight * 0.7, 320);
  const gap = 12;
  const padding = 10;

  const candidates = [
    { top: rect.bottom + gap, left: rect.left, name: "bottom" },
    { top: rect.top - cardHeight - gap, left: rect.left, name: "top" },
    { top: rect.top, left: rect.right + gap, name: "right" },
    { top: rect.top, left: rect.left - cardWidth - gap, name: "left" }
  ];

  const overflowPenalty = (candidate) => {
    const overflowLeft = Math.max(0, padding - candidate.left);
    const overflowRight = Math.max(0, candidate.left + cardWidth - (viewportWidth - padding));
    const overflowTop = Math.max(0, padding - candidate.top);
    const overflowBottom = Math.max(0, candidate.top + cardHeight - (viewportHeight - padding));
    return overflowLeft + overflowRight + overflowTop + overflowBottom;
  };

  const best = candidates.reduce((winner, current) => (overflowPenalty(current) < overflowPenalty(winner) ? current : winner), candidates[0]);

  const left = Math.max(padding, Math.min(viewportWidth - cardWidth - padding, best.left));
  const top = Math.max(padding, Math.min(viewportHeight - cardHeight - padding, best.top));

  return { top: `${top}px`, left: `${left}px` };
}

function buildAppMenuBody(content) {
  return (
    <div>
      <p>{content?.appMenuText || ""}</p>
      {Array.isArray(content?.appMenuOptions) && content.appMenuOptions.length > 0 ? (
        <ul className="onboarding-option-list">
          {content.appMenuOptions.map((item) => (
            <li key={`${item.name}-${item.description}`}>
              <strong>{item.name}:</strong> {item.description}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function buildSteps(moduleId, moduleTitle, t, content, pathname, language) {
  const sidebarTitle = content?.sidebarTitle || t("onboarding.sidebarTitle");
  const sidebarText = content?.sidebarText || t("onboarding.sidebarText");
  const appMenuTitle = content?.appMenuTitle || t("onboarding.appMenuTitle");
  const actionsTitle = content?.actionsTitle || t("onboarding.actionsMenuTitle");
  const actionsText =
    content?.actionsText ||
    `${t("onboarding.actionsMenuText")} ${moduleTitle ? `(${moduleTitle})` : ""}`.trim();
  const workspaceTitle = content?.workspaceTitle || t("onboarding.tableTitle");
  const workspaceText = content?.workspaceText || t("onboarding.tableText");

  if (moduleId === "dashboard") {
    return [
      { selector: '[data-tour="sidebar-icons"]', title: sidebarTitle, body: <p>{sidebarText}</p> },
      {
        selector: '[data-tour="topbar-search"]',
        title: language === "es" ? "Búsqueda general" : "Global search",
        body: (
          <p>
            {language === "es"
              ? "Usa este campo para buscar de forma global en transacciones, clientes, proveedores, productos, conceptos y depósitos."
              : "Use this field for global search across transactions, clients, suppliers, products, concepts and deposits."}
          </p>
        )
      },
      {
        selector: '[data-tour="topbar-home"]',
        title: language === "es" ? "Botón Home" : "Home button",
        body: <p>{language === "es" ? "Te lleva al dashboard principal." : "Takes you to the main dashboard."}</p>
      },
      {
        selector: '[data-tour="topbar-account-switch"]',
        title: language === "es" ? "Cambio de cuenta" : "Account switch",
        body: (
          <p>
            {language === "es"
              ? "Permite cambiar entre cuentas a las que tu usuario tiene acceso."
              : "Lets you switch between accounts your user can access."}
          </p>
        )
      },
      {
        selector: '[data-tour="topbar-notifications"]',
        title: language === "es" ? "Notificaciones" : "Notifications",
        body: (
          <p>
            {language === "es"
              ? "Aquí verás alertas importantes, como invitaciones pendientes."
              : "Important alerts appear here, such as pending invitations."}
          </p>
        )
      },
      {
        selector: '[data-tour="user-menu-button"]',
        title: language === "es" ? "Menú de usuario" : "User menu",
        body: (
          <p>
            {language === "es"
              ? "Desde aquí puedes gestionar preferencias, idioma, tema y cerrar sesión."
              : "Manage preferences, language, theme, and sign out from here."}
          </p>
        )
      },
      { selector: '[data-tour="app-menu"]', title: appMenuTitle, body: buildAppMenuBody(content) },
      { selector: '[data-tour="actions-menu"]', title: actionsTitle, body: <p>{actionsText}</p> },
      { selector: '[data-tour="workspace"]', title: workspaceTitle, body: <p>{workspaceText}</p> }
    ];
  }

  if (moduleId === "account") {
    return [{ selector: '[data-tour="workspace"]', title: appMenuTitle, body: buildAppMenuBody(content) }];
  }

  if (moduleId === "appointments" && pathname.startsWith("/appointments/by-employee")) {
    return [
      { selector: '[data-tour="app-menu"]', title: appMenuTitle, body: buildAppMenuBody(content) },
      { selector: '[data-tour="actions-menu"]', title: actionsTitle, body: <p>{actionsText}</p> },
      {
        selector: '[data-tour="appointments-by-employee-grid"]',
        title: language === "es" ? "Calendario por empleado" : "Calendar by employee",
        body: (
          <div>
            <p>
              {language === "es"
                ? "Puedes agregar citas haciendo clic en una fecha/hora del calendario."
                : "You can add appointments by clicking any date/time cell in the calendar."}
            </p>
            <p>
              {language === "es"
                ? "Las celdas grises indican que el empleado no está disponible."
                : "Gray cells indicate the employee is not available."}
            </p>
            <p>
              {language === "es"
                ? "La disponibilidad se define en el módulo de empleados."
                : "Availability is configured in the employees module."}{" "}
              <a href="/employees">
                {language === "es" ? "Ir a empleados" : "Go to employees"}
              </a>
            </p>
          </div>
        )
      }
    ];
  }

  return [
    { selector: '[data-tour="app-menu"]', title: appMenuTitle, body: buildAppMenuBody(content) },
    { selector: '[data-tour="actions-menu"]', title: actionsTitle, body: <p>{actionsText}</p> },
    { selector: '[data-tour="workspace"]', title: workspaceTitle, body: <p>{workspaceText}</p> }
  ];
}

function ModuleOnboarding() {
  const { pathname } = useLocation();
  const { t, language } = useI18n();
  const [mode, setMode] = useState("closed");
  const [currentStep, setCurrentStep] = useState(0);
  const [moduleInfo, setModuleInfo] = useState(null);

  const locale = onboardingContent?.[language] ? language : "es";
  const moduleContent = moduleInfo?.id ? onboardingContent?.[locale]?.[moduleInfo.id] : null;
  const moduleTitle = moduleInfo ? t(moduleInfo.titleKey) : "";
  const steps = useMemo(
    () => buildSteps(moduleInfo?.id, moduleTitle, t, moduleContent, pathname, language),
    [moduleInfo?.id, moduleTitle, t, moduleContent, pathname, language]
  );

  useEffect(() => {
    const module = getModuleByPath(pathname);
    setModuleInfo(module);
    if (!module) {
      setMode("closed");
      return;
    }

    const done = localStorage.getItem(storageKey(module.id)) === "1";
    if (!done) {
      setCurrentStep(0);
      setMode("welcome");
    } else {
      setMode("closed");
    }
  }, [pathname]);

  useEffect(() => {
    const onOpen = (event) => {
      const requestedModuleId = event?.detail?.moduleId || null;
      const module = getModuleByPath(pathname);
      if (!module) return;
      if (requestedModuleId && requestedModuleId !== module.id) return;
      setModuleInfo(module);
      setCurrentStep(0);
      setMode("welcome");
    };

    window.addEventListener("onboarding:open", onOpen);
    return () => window.removeEventListener("onboarding:open", onOpen);
  }, [pathname]);

  useEffect(() => {
    if (mode !== "steps") return;
    const step = steps[currentStep];
    if (!step) return;
    const target = document.querySelector(step.selector);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }, [mode, currentStep, steps]);

  useEffect(() => {
    if (mode === "closed") return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        markDone();
        return;
      }

      if (mode === "welcome") {
        if (event.key === "ArrowRight" || event.key === "Enter") {
          event.preventDefault();
          setMode("steps");
        }
        return;
      }

      if (mode !== "steps") return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentStep((prev) => Math.max(0, prev - 1));
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setCurrentStep((prev) => {
          if (prev + 1 >= steps.length) {
            markDone();
            return prev;
          }
          return prev + 1;
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, steps.length]);

  const markDone = () => {
    if (moduleInfo?.id) {
      localStorage.setItem(storageKey(moduleInfo.id), "1");
    }
    setMode("closed");
  };

  const step = mode === "steps" ? steps[currentStep] : null;
  const target = step ? document.querySelector(step.selector) : null;
  const rect = target?.getBoundingClientRect?.() ?? null;

  const tooltipStyle = getTooltipStyle(rect);

  if (mode === "closed" || !moduleInfo) return null;

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true">
      {mode === "welcome" ? (
        <div className="onboarding-card">
          <h3>
            {t("onboarding.welcomeTitle")} {t(moduleInfo.titleKey)}
          </h3>
          <p>
            {moduleContent?.intro || `${t("onboarding.welcomeDescription")} ${t(moduleInfo.titleKey)}.`}
          </p>
          <div className="onboarding-actions">
            <button type="button" className="button-secondary" onClick={markDone}>
              {t("onboarding.skip")}
            </button>
            <button type="button" className="button-link-primary" onClick={() => setMode("steps")}>
              {t("onboarding.start")}
            </button>
          </div>
        </div>
      ) : (
        <>
          {rect ? (
            <div
              className="onboarding-highlight"
              style={{
                top: `${rect.top - 6}px`,
                left: `${rect.left - 6}px`,
                width: `${rect.width + 12}px`,
                height: `${rect.height + 12}px`
              }}
            />
          ) : null}
          <div className="onboarding-card onboarding-step" style={tooltipStyle}>
            <h4>{step?.title}</h4>
            {step?.body}
            <small>
              {currentStep + 1} / {steps.length}
            </small>
            <div className="onboarding-actions">
              <button type="button" className="button-secondary" onClick={markDone}>
                {t("onboarding.finish")}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
                disabled={currentStep === 0}
              >
                {t("common.previous")}
              </button>
              <button
                type="button"
                className="button-link-primary"
                onClick={() => {
                  if (currentStep + 1 >= steps.length) {
                    markDone();
                    return;
                  }
                  setCurrentStep((prev) => prev + 1);
                }}
              >
                {currentStep + 1 >= steps.length ? t("onboarding.finish") : t("common.next")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ModuleOnboarding;
