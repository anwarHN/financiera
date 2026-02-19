import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AcceptInvitationPage from "./pages/AcceptInvitationPage";
import DashboardPage from "./pages/DashboardPage";
import PeoplePage from "./pages/PeoplePage";
import PeopleFormPage from "./pages/PeopleFormPage";
import EmployeesPage from "./pages/EmployeesPage";
import EmployeeFormPage from "./pages/EmployeeFormPage";
import ConceptModulePage from "./pages/ConceptModulePage";
import ConceptModuleFormPage from "./pages/ConceptModuleFormPage";
import TransactionsPage from "./pages/TransactionsPage";
import TransactionCreatePage from "./pages/TransactionCreatePage";
import TransactionDetailPage from "./pages/TransactionDetailPage";
import ReportsPage from "./pages/ReportsPage";
import ProfilesPage from "./pages/ProfilesPage";
import AdminPage from "./pages/AdminPage";
import AccountManagePage from "./pages/AccountManagePage";
import AccountSettingsPage from "./pages/AccountSettingsPage";
import AccountBillingPage from "./pages/AccountBillingPage";
import AccountInvitationsPage from "./pages/AccountInvitationsPage";
import AccountPaymentFormsPage from "./pages/AccountPaymentFormsPage";
import AccountPaymentFormPage from "./pages/AccountPaymentFormPage";
import BankReconciliationPage from "./pages/BankReconciliationPage";
import InternalAccountPayablesPage from "./pages/InternalAccountPayablesPage";
import InternalAccountPayableFormPage from "./pages/InternalAccountPayableFormPage";
import BankDepositsPage from "./pages/BankDepositsPage";
import BankDepositFormPage from "./pages/BankDepositFormPage";
import BankTransfersPage from "./pages/BankTransfersPage";
import BankTransferFormPage from "./pages/BankTransferFormPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectFormPage from "./pages/ProjectFormPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import BudgetsPage from "./pages/BudgetsPage";
import BudgetFormPage from "./pages/BudgetFormPage";
import BudgetDetailPage from "./pages/BudgetDetailPage";
import AppointmentsPage from "./pages/AppointmentsPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/accept-invitation/:invitationId" element={<AcceptInvitationPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="clients" element={<PeoplePage personType={1} titleKey="clients.title" basePath="/clients" />} />
        <Route
          path="clients/new"
          element={<PeopleFormPage personType={1} titleKey="actions.newClient" basePath="/clients" />}
        />
        <Route
          path="clients/:id/edit"
          element={<PeopleFormPage personType={1} titleKey="actions.newClient" basePath="/clients" />}
        />
        <Route
          path="providers"
          element={<PeoplePage personType={2} titleKey="providers.title" basePath="/providers" />}
        />
        <Route
          path="providers/new"
          element={<PeopleFormPage personType={2} titleKey="actions.newProvider" basePath="/providers" />}
        />
        <Route
          path="providers/:id/edit"
          element={<PeopleFormPage personType={2} titleKey="actions.newProvider" basePath="/providers" />}
        />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/new" element={<EmployeeFormPage />} />
        <Route path="employees/:id/edit" element={<EmployeeFormPage />} />
        <Route
          path="products"
          element={<ConceptModulePage moduleType="products" titleKey="conceptModules.products" basePath="/products" />}
        />
        <Route
          path="products/new"
          element={
            <ConceptModuleFormPage moduleType="products" titleKey="actions.newProduct" basePath="/products" />
          }
        />
        <Route
          path="products/:id/edit"
          element={
            <ConceptModuleFormPage moduleType="products" titleKey="actions.newProduct" basePath="/products" />
          }
        />
        <Route
          path="income-concepts"
          element={
            <ConceptModulePage moduleType="income" titleKey="conceptModules.income" basePath="/income-concepts" />
          }
        />
        <Route
          path="income-concepts/new"
          element={
            <ConceptModuleFormPage
              moduleType="income"
              titleKey="actions.newIncomeConcept"
              basePath="/income-concepts"
            />
          }
        />
        <Route
          path="income-concepts/:id/edit"
          element={
            <ConceptModuleFormPage
              moduleType="income"
              titleKey="actions.newIncomeConcept"
              basePath="/income-concepts"
            />
          }
        />
        <Route
          path="expense-concepts"
          element={
            <ConceptModulePage moduleType="expense" titleKey="conceptModules.expense" basePath="/expense-concepts" />
          }
        />
        <Route
          path="expense-concepts/new"
          element={
            <ConceptModuleFormPage
              moduleType="expense"
              titleKey="actions.newExpenseConcept"
              basePath="/expense-concepts"
            />
          }
        />
        <Route
          path="expense-concepts/:id/edit"
          element={
            <ConceptModuleFormPage
              moduleType="expense"
              titleKey="actions.newExpenseConcept"
              basePath="/expense-concepts"
            />
          }
        />
        <Route
          path="concept-groups"
          element={<ConceptModulePage moduleType="groups" titleKey="conceptModules.groups" basePath="/concept-groups" />}
        />
        <Route
          path="concept-groups/new"
          element={
            <ConceptModuleFormPage moduleType="groups" titleKey="actions.newConceptGroup" basePath="/concept-groups" />
          }
        />
        <Route
          path="concept-groups/:id/edit"
          element={
            <ConceptModuleFormPage moduleType="groups" titleKey="actions.newConceptGroup" basePath="/concept-groups" />
          }
        />
        <Route path="sales" element={<TransactionsPage moduleType="sale" />} />
        <Route path="sales/:id" element={<TransactionDetailPage moduleType="sale" />} />
        <Route path="appointments" element={<Navigate to="/appointments/calendar" replace />} />
        <Route path="appointments/calendar" element={<AppointmentsPage mode="calendar" />} />
        <Route path="appointments/by-employee" element={<AppointmentsPage mode="by-employee" />} />
        <Route path="appointments/table" element={<AppointmentsPage mode="table" />} />
        <Route path="expenses" element={<TransactionsPage moduleType="expense" />} />
        <Route path="expenses/new" element={<TransactionCreatePage moduleType="expense" />} />
        <Route path="incomes" element={<TransactionsPage moduleType="income" />} />
        <Route path="incomes/new" element={<TransactionCreatePage moduleType="income" />} />
        <Route path="purchases" element={<TransactionsPage moduleType="purchase" />} />
        <Route path="purchases/new" element={<TransactionCreatePage moduleType="purchase" />} />
        <Route path="purchases/:id" element={<TransactionDetailPage moduleType="purchase" />} />
        <Route path="payment-forms" element={<AccountPaymentFormsPage />} />
        <Route path="payment-forms/new" element={<AccountPaymentFormPage />} />
        <Route path="payment-forms/:id/edit" element={<AccountPaymentFormPage />} />
        <Route path="bank-deposits" element={<BankDepositsPage />} />
        <Route path="bank-deposits/new" element={<BankDepositFormPage />} />
        <Route path="bank-transfers" element={<BankTransfersPage />} />
        <Route path="bank-transfers/new" element={<BankTransferFormPage />} />
        <Route path="internal-obligations" element={<InternalAccountPayablesPage />} />
        <Route path="internal-obligations/new" element={<InternalAccountPayableFormPage />} />
        <Route path="internal-obligations/:id/edit" element={<InternalAccountPayableFormPage />} />
        <Route path="bank-reconciliation" element={<BankReconciliationPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/new" element={<ProjectFormPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="projects/:id/edit" element={<ProjectFormPage />} />
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="budgets/new" element={<BudgetFormPage />} />
        <Route path="budgets/:id" element={<BudgetDetailPage />} />
        <Route path="budgets/:id/edit" element={<BudgetFormPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="account" element={<AccountManagePage />}>
          <Route index element={<Navigate to="/account/users" replace />} />
          <Route path="billing" element={<AccountBillingPage />} />
          <Route path="users" element={<AdminPage />} />
          <Route path="profiles" element={<ProfilesPage />} />
          <Route path="invitations" element={<AccountInvitationsPage />} />
          <Route path="settings" element={<AccountSettingsPage />} />
        </Route>
        <Route path="profiles" element={<Navigate to="/account/profiles" replace />} />
        <Route path="admin" element={<Navigate to="/account/users" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
