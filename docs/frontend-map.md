# Mapa del frontend

## Entrada y rutas
### `src/main.jsx`
Monta React y envuelve la app con proveedores globales.

### `src/App.jsx`
Define rutas públicas y privadas.
Rutas públicas:
- login
- register
- términos
- privacidad
- aceptación de invitación

Rutas privadas bajo `Layout`:
- dashboard
- personas
- empleados
- productos y conceptos
- ventas, compras, ingresos, gastos
- cuentas por cobrar/pagar
- inventario
- bancos/cajas
- planificación
- reportes
- gestión de cuenta

## Contextos
### `src/contexts/AuthContext.jsx`
Contexto principal de autenticación y cuenta activa.
Responsabilidades:
- cargar sesión actual
- escuchar cambios de auth
- cargar cuentas del usuario
- conservar y cambiar `activeAccountId`
- cargar símbolo de moneda local en `localStorage`
- cargar perfil actual del usuario por cuenta
- exponer permisos y helpers de acceso
- mostrar `accountNotice` para bienvenida/cambio de cuenta

Valores principales expuestos:
- `session`, `user`
- `account`, `accounts`
- `currentProfile`
- `isSystemAdmin`
- `canVoidTransactions`, `canCreateUsers`, `canCreateProfiles`
- `hasModulePermission(module, action)`
- `hasDashboardAccess()`
- `hasReportPermission(reportId)`
- `hasAccountSectionAccess(section)`
- `hasPathAccess(pathname)`
- `switchAccount(nextAccountId)`
- `refreshAccounts()`
- `login`, `register`, `logout`
- `accountNotice`, `dismissAccountNotice()`

### `src/contexts/I18nContext.jsx`
Contexto de idioma.
Responsabilidades:
- mantener `language`
- resolver traducciones con `t(key)`
- permitir `setLanguage`

## Hooks
### `src/hooks/useModulePermissions.js`
Hook de conveniencia para permisos del módulo actual.
Entrega banderas de lectura/creación/edición según el perfil cargado en `AuthContext`.

## Componentes principales
### `src/components/Layout.jsx`
Shell principal autenticado.
Responsabilidades:
- renderizar `topbar`
- renderizar `icons-menu`, `app-menu`, `actions-menu`
- cambiar módulo actual según ruta
- manejar búsqueda global
- manejar tema, tamaño de texto y densidad
- mostrar banner de cuenta relacionada
- mostrar modal de cuenta activa/cambio de cuenta
- forzar remonte del `workspace` al cambiar `accountId`

### `src/components/ProtectedRoute.jsx`
Bloquea acceso a rutas sin sesión o sin permisos.
Puede mostrar `AccessDeniedPage` cuando la ruta no está permitida.

### `src/components/AccessDeniedPage.jsx`
Estado visual reutilizable para acceso denegado.

### `src/components/ModuleOnboarding.jsx`
Onboarding contextual por módulo/ruta.
Usa `src/config/onboardingContent.json`.

### `src/components/OnboardingHelpButton.jsx`
Botón para abrir la guía de onboarding.

### `src/components/LoadingSkeleton.jsx`
Skeleton reutilizable para estados de carga.

### `src/components/RowActionsMenu.jsx`
Menú contextual por fila de tabla.

### `src/components/Pagination.jsx`
Paginación simple de listados.

### `src/components/LookupCombobox.jsx`
Selector/buscador reusable para catálogos relacionados.

### `src/components/TagsLookupField.jsx`
Campo reusable para tags con sugerencias.

### `src/components/ToggleSwitch.jsx`
Toggle reusable usado en formularios y banderas booleanas.

### `src/components/StatusBadge.jsx`
Badge visual de estado.

### `src/components/PaymentRegisterModal.jsx`
Modal para registrar pagos desde listados.

### `src/components/InventoryDeliveryHistoryModal.jsx`
Modal para ver historial de entregas agrupado por lote.

### `src/components/AppointmentFormModal.jsx`
Formulario modal de citas.

### `src/components/AppointmentsCalendar.jsx`
Vista calendario para citas.

### `src/components/EmployeeAvailabilityModal.jsx`
Modal para gestionar disponibilidad de empleados.

### `src/components/ChartCanvas.jsx`
Wrapper de gráficos Chart.js.

## Componentes de formulario
### `src/components/form/FormField.jsx`
Base visual de campos.

### `src/components/form/TextField.jsx`
Input de texto con label consistente.

### `src/components/form/NumberField.jsx`
Input numérico con label consistente.

### `src/components/form/DateField.jsx`
Campo de fecha reutilizable.

### `src/components/form/SelectField.jsx`
Select reutilizable con label.

### `src/components/form/ReadOnlyField.jsx`
Campo de solo lectura sin usar `input`.
Soporta tipos:
- text
- number
- currency
- date
- datetime
- boolean
- email
- phone
- multiline

## Páginas
### Autenticación
- `LoginPage.jsx`: login.
- `RegisterPage.jsx`: registro.
- `AcceptInvitationPage.jsx`: acepta invitaciones compartidas.
- `TermsOfServicePage.jsx`: términos.
- `PrivacyPolicyPage.jsx`: privacidad.

### Dashboard
- `DashboardPage.jsx`: resumen operativo, gráficas y saldos bancarios.

### Personas
- `PeoplePage.jsx`: listado de clientes/proveedores filtrado por tipo.
- `PeopleFormPage.jsx`: formulario moderno de cliente/proveedor.
- `PersonsPage.jsx`: listado legacy de personas.
- `PersonFormPage.jsx`: formulario legacy de persona.

### Empleados
- `EmployeesPage.jsx`: listado de empleados.
- `EmployeeFormPage.jsx`: crear/editar empleado.
- `EmployeeAbsencesPage.jsx`: ausencias por empleado.

### Citas
- `AppointmentsPage.jsx`: wrapper de vistas de citas.

### Conceptos y productos
- `ConceptModulePage.jsx`: listados de productos, conceptos de ingreso/gasto, grupos y Kardex.
- `ConceptModuleFormPage.jsx`: formulario por tipo de concepto.
- `ConceptsPage.jsx`: listado legacy de conceptos.
- `ConceptFormPage.jsx`: formulario legacy de concepto.

### Transacciones
- `TransactionsPage.jsx`: listados de ventas, compras, ingresos, gastos, ajustes, CxC/CxP.
- `TransactionCreatePage.jsx`: formulario principal de transacciones.
- `TransactionDetailPage.jsx`: detalle de factura/compra y pagos/entregas.
- `TransactionPaymentPage.jsx`: formulario de pago entrante/saliente.

### Inventario
- `InventoryDeliveriesPage.jsx`: registra entregas posteriores y consulta historial.

### Bancos / cajas / formas de pago
- `AccountPaymentFormsPage.jsx`: lista cuentas bancarias, tarjetas, cajas.
- `AccountPaymentFormPage.jsx`: crea/edita forma de pago.
- `CashboxesPage.jsx`: listado de cajas.
- `CashboxFormPage.jsx`: formulario de caja.
- `BankDepositsPage.jsx`: listado de depósitos bancarios.
- `BankDepositFormPage.jsx`: crear/editar depósito bancario.
- `BankTransfersPage.jsx`: listado de traslados bancarios.
- `BankTransferFormPage.jsx`: crear traslado entre bancos.
- `BankCashWithdrawalsPage.jsx`: listado de retiros de efectivo.
- `BankCashWithdrawalFormPage.jsx`: crear retiro de banco a caja.
- `BankReconciliationPage.jsx`: conciliación bancaria, saldos y exportación.

### Obligaciones / préstamos
- `InternalAccountPayablesPage.jsx`: obligaciones internas.
- `InternalAccountPayableFormPage.jsx`: formulario de obligación interna.
- `EmployeeLoansPage.jsx`: listado de préstamos a empleados.
- `EmployeeLoanFormPage.jsx`: crear/editar préstamo.

### Planificación
- `ProjectsPage.jsx`: listado de proyectos.
- `ProjectFormPage.jsx`: crear/editar proyecto.
- `ProjectDetailPage.jsx`: detalle de proyecto.
- `BudgetsPage.jsx`: listado de presupuestos.
- `BudgetFormPage.jsx`: crear/editar presupuesto.
- `BudgetDetailPage.jsx`: detalle de presupuesto.

### Administración de cuenta
- `AccountManagePage.jsx`: shell interno de secciones de cuenta.
- `AccountSettingsPage.jsx`: ajustes generales.
- `AccountBillingPage.jsx`: billing y suscripción.
- `AccountInvitationsPage.jsx`: invitaciones pendientes.
- `AdminPage.jsx`: usuarios de la cuenta.
- `ProfilesPage.jsx`: perfiles, permisos por módulo y acceso por reporte.
- `CurrenciesPage.jsx`: monedas de la cuenta.

### Reportes
- `ReportsPage.jsx`: pantalla única de reportes y exportación.

## Utilidades
- `src/utils/accessControl.js`: resuelve módulo o sección administrativa a partir de la ruta.
- `src/utils/dateFormat.js`: `formatDate`, `formatDateTime`.
- `src/utils/numberFormat.js`: `formatNumber` con símbolo de moneda configurable desde `localStorage`.
- `src/utils/paymentFormLabel.js`: arma etiqueta legible de una forma de pago.
