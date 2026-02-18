import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";
import onboardingContent from "../config/onboardingContent.json";

const MODULES = [
  { id: "dashboard", match: (p) => p === "/" || p === "/dashboard", titleKey: "nav.dashboard" },
  { id: "clients", match: (p) => p.startsWith("/clients"), titleKey: "nav.clients" },
  { id: "providers", match: (p) => p.startsWith("/providers"), titleKey: "nav.providers" },
  { id: "employees", match: (p) => p.startsWith("/employees"), titleKey: "nav.employees" },
  { id: "products", match: (p) => p.startsWith("/products"), titleKey: "nav.products" },
  {
    id: "transactions",
    match: (p) => p.startsWith("/sales") || p.startsWith("/purchases") || p.startsWith("/expenses") || p.startsWith("/incomes"),
    titleKey: "sidebar.transactions"
  },
  {
    id: "concepts",
    match: (p) =>
      p.startsWith("/income-concepts") || p.startsWith("/expense-concepts") || p.startsWith("/payable-concepts") || p.startsWith("/concept-groups"),
    titleKey: "sidebar.concepts"
  },
  {
    id: "payments",
    match: (p) =>
      p.startsWith("/payment-forms") ||
      p.startsWith("/bank-deposits") ||
      p.startsWith("/bank-transfers") ||
      p.startsWith("/internal-obligations") ||
      p.startsWith("/bank-reconciliation"),
    titleKey: "nav.paymentForms"
  },
  { id: "planning", match: (p) => p.startsWith("/projects") || p.startsWith("/budgets"), titleKey: "nav.planning" },
  { id: "reports", match: (p) => p.startsWith("/reports"), titleKey: "nav.reports" },
  { id: "account", match: (p) => p.startsWith("/account"), titleKey: "topbar.manageAccount" }
];

function storageKey(moduleId) {
  return `module-onboarding:${moduleId}:done`;
}

function getModuleByPath(pathname) {
  return MODULES.find((module) => module.match(pathname)) ?? null;
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

function buildSteps(moduleId, moduleTitle, t, content) {
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
      { selector: '[data-tour="app-menu"]', title: appMenuTitle, body: buildAppMenuBody(content) },
      { selector: '[data-tour="actions-menu"]', title: actionsTitle, body: <p>{actionsText}</p> },
      { selector: '[data-tour="workspace"]', title: workspaceTitle, body: <p>{workspaceText}</p> }
    ];
  }

  if (moduleId === "account") {
    return [{ selector: '[data-tour="workspace"]', title: appMenuTitle, body: buildAppMenuBody(content) }];
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
    () => buildSteps(moduleInfo?.id, moduleTitle, t, moduleContent),
    [moduleInfo?.id, moduleTitle, t, moduleContent]
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
    if (mode !== "steps") return;
    const step = steps[currentStep];
    if (!step) return;
    const target = document.querySelector(step.selector);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }, [mode, currentStep, steps]);

  const markDone = () => {
    if (moduleInfo?.id) {
      localStorage.setItem(storageKey(moduleInfo.id), "1");
    }
    setMode("closed");
  };

  const step = mode === "steps" ? steps[currentStep] : null;
  const target = step ? document.querySelector(step.selector) : null;
  const rect = target?.getBoundingClientRect?.() ?? null;

  const tooltipStyle = rect
    ? {
        top: `${Math.min(window.innerHeight - 170, rect.bottom + 10)}px`,
        left: `${Math.max(10, Math.min(window.innerWidth - 360, rect.left))}px`
      }
    : {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)"
      };

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
