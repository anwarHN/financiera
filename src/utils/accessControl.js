export function resolveReadModuleByPath(pathname) {
  if (pathname === "/") return "dashboard";
  if (pathname.startsWith("/clients")) return "clients";
  if (pathname.startsWith("/providers")) return "providers";
  if (pathname.startsWith("/employees")) return "employees";
  if (pathname.startsWith("/appointments")) return "appointments";
  if (pathname.startsWith("/employee-absences")) return "appointments";
  if (pathname.startsWith("/products")) return "concepts";
  if (pathname.startsWith("/income-concepts")) return "concepts";
  if (pathname.startsWith("/expense-concepts")) return "concepts";
  if (pathname.startsWith("/concept-groups")) return "concepts";
  if (pathname.startsWith("/payment-forms")) return "paymentForms";
  if (pathname.startsWith("/cashboxes")) return "paymentForms";
  if (pathname.startsWith("/bank-deposits")) return "transactions";
  if (pathname.startsWith("/bank-transfers")) return "transactions";
  if (pathname.startsWith("/bank-cash-withdrawals")) return "transactions";
  if (pathname.startsWith("/internal-obligations")) return "transactions";
  if (pathname.startsWith("/employee-loans")) return "transactions";
  if (pathname.startsWith("/bank-reconciliation")) return "transactions";
  if (pathname.startsWith("/accounts-receivable")) return "transactions";
  if (pathname.startsWith("/accounts-payable")) return "transactions";
  if (pathname.startsWith("/sales")) return "transactions";
  if (pathname.startsWith("/purchases")) return "transactions";
  if (pathname.startsWith("/inventory-adjustments")) return "transactions";
  if (pathname.startsWith("/inventory-deliveries")) return "transactions";
  if (pathname.startsWith("/expenses")) return "transactions";
  if (pathname.startsWith("/incomes")) return "transactions";
  if (pathname.startsWith("/projects")) return "planning";
  if (pathname.startsWith("/budgets")) return "planning";
  if (pathname.startsWith("/currencies")) return "catalogs";
  if (pathname.startsWith("/reports")) return "reports";
  return null;
}

export function resolveAccountSectionByPath(pathname) {
  if (!(pathname === "/account" || pathname.startsWith("/account/"))) return null;
  if (pathname.startsWith("/account/billing")) return "billing";
  if (pathname.startsWith("/account/users")) return "users";
  if (pathname.startsWith("/account/profiles")) return "profiles";
  if (pathname.startsWith("/account/invitations")) return "invitations";
  if (pathname.startsWith("/account/settings")) return "settings";
  return "root";
}
