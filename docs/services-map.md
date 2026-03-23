# Mapa de servicios y funciones exportadas

## `src/services/authService.js`
- `signIn`: login con Supabase.
- `signUp`: registro inicial y alta de cuenta/usuario.
- `signOut`: cierre de sesión.
- `getCurrentSession`: lee sesión actual.
- `onAuthStateChange`: suscribe cambios de autenticación.

## `src/services/accountService.js`
- `listUserAccounts`: lista cuentas accesibles por usuario.
- `getCurrentAccount`: obtiene cuenta principal/actual.
- `getAccountById`: consulta una cuenta por id.
- `updateAccount`: actualiza datos generales de la cuenta.

## `src/services/profilesService.js`
- `listProfiles`: lista perfiles de la cuenta.
- `createProfile`: crea perfil.
- `updateProfile`: actualiza perfil.
- `listUserProfiles`: lista asignaciones de perfiles por usuario.
- `assignUserProfile`: asigna perfil a usuario.
- `getCurrentUserProfile`: perfil actual del usuario en una cuenta.

## `src/services/adminService.js`
- `listAccountUsers`: lista usuarios de la cuenta por Edge Function.
- `listInvitations`: lista invitaciones.
- `sendInvitation`: envía invitación.
- `resendInvitation`: reenvía invitación.
- `deactivateAccountUser`: desactiva usuario compartido.

## `src/services/invitationsService.js`
- `markInvitationAccepted`: marca invitación aceptada.
- `getInvitationById`: obtiene invitación.
- `listPendingInvitationsForCurrentUser`: invita pendientes del usuario logueado.

## `src/services/billingService.js`
- `createCheckoutSession`: inicia checkout de Stripe/servicio de billing.
- `createPortalSession`: abre portal de billing.
- `syncBillingSeats`: sincroniza seats/usuarios.
- `listBillingPaymentMethods`: lista métodos de pago de billing.
- `createBillingSetupSession`: inicia setup de método.
- `setDefaultBillingPaymentMethod`: define método por defecto.

## `src/services/personsService.js`
- `listPersons`: lista personas de la cuenta.
- `listPersonsByType`: filtra clientes/proveedores.
- `getPersonById`: obtiene persona.
- `createPerson`: crea persona.
- `updatePerson`: actualiza persona.
- `deletePerson`: baja lógica.
- `listPersonAccountTransactions`: historial de CxC/CxP por persona.

## `src/services/employeesService.js`
- `listEmployees`: lista empleados.
- `getEmployeeById`: obtiene empleado.
- `createEmployee`: crea empleado.
- `updateEmployee`: actualiza empleado.
- `deactivateEmployee`: baja lógica.

## `src/services/employeeScheduleService.js`
- `listEmployeeAvailability`: disponibilidad global.
- `listEmployeeAvailabilityByEmployee`: disponibilidad por empleado.
- `replaceEmployeeAvailability`: reemplaza bloques de disponibilidad.
- `listEmployeeAbsences`: lista ausencias.
- `createEmployeeAbsence`: crea ausencia.
- `updateEmployeeAbsence`: actualiza ausencia.
- `deactivateEmployeeAbsence`: baja lógica de ausencia.

## `src/services/currenciesService.js`
- `listCurrencies`: lista monedas.
- `createCurrency`: crea moneda.
- `updateCurrency`: actualiza moneda.

## `src/services/paymentMethodsService.js`
- `listPaymentMethods`: lista métodos de pago lógicos.
- `createPaymentMethod`: crea método de pago no sistémico.

## `src/services/accountPaymentFormsService.js`
- `listAccountPaymentForms`: lista cajas, bancos y tarjetas.
- `getAccountPaymentFormById`: obtiene forma de pago.
- `createAccountPaymentForm`: crea forma de pago.
- `updateAccountPaymentForm`: actualiza forma de pago.
- `deleteAccountPaymentForm`: baja lógica.

## `src/services/conceptsService.js`
- `getProductKardex`: construye Kardex por producto.
- `listConcepts`: lista conceptos con stock agregado.
- `listConceptsByModule`: lista conceptos por módulo.
- `getConceptById`: obtiene concepto.
- `createConcept`: crea concepto.
- `updateConcept`: actualiza concepto.
- `deleteConcept`: baja lógica.
Notas:
- `attachProductStock` es interna: calcula inventario actual, pendiente y disponible.
- existe backup: `conceptsService.kardex-backup-2026-03-14.js`.

## `src/services/projectsService.js`
- `listProjects`: lista proyectos.
- `getProjectById`: obtiene proyecto.
- `createProject`: crea proyecto.
- `updateProject`: actualiza proyecto.
- `deactivateProject`: baja lógica.

## `src/services/budgetsService.js`
- `listBudgets`: lista presupuestos.
- `getBudgetById`: obtiene presupuesto.
- `listBudgetLines`: obtiene líneas.
- `createBudgetWithLines`: crea presupuesto y líneas.
- `updateBudgetWithLines`: actualiza presupuesto y líneas.
- `deactivateBudget`: baja lógica.
- `getBudgetExecutionReport`: ejecución por presupuesto.
- `getProjectExecutionReport`: ejecución por proyecto.

## `src/services/dashboardService.js`
- `DASHBOARD_TYPES`: tipos usados en agregaciones del dashboard.
- `getDashboardData`: arma todo el dataset del dashboard.

## `src/services/globalSearchService.js`
- `searchGlobalByAccount`: búsqueda global multi-módulo por cuenta.

## `src/services/reportsService.js`
- `getTransactionsForReports`: base de transacciones para reportes generales.
- `getOutstandingTransactionsForReports`: base de CxC/CxP.
- `getCashflowConceptTotals`: totales de flujo por grupo/concepto.
- `getCashflowBankBalances`: saldos por banco/caja/efectivo.
- `getCashflowOutstandingBalanceSummary`: saldos pendientes CxC/CxP al corte.
- `getEmployeeAbsenceTotals`: ausencias por empleado.
- `getSalesByEmployeeTotals`: ventas por vendedor.
- `getExpensesByTagAndPaymentForm`: gastos por tag y forma de pago.
- `getEmployeeLoansReport`: reporte de préstamos.
- `getEmployeePayrollReport`: planilla con ajustes.
- `getCashboxesBalanceReport`: saldos de cajas.
- `getPendingDeliveriesReport`: pendientes de entrega.
- `exportReportXlsx`: llama la Edge Function de exportación.

## `src/services/transactionsService.js`
### Constantes
- `TRANSACTION_TYPES`: enum de tipos de transacción.

### Listados y consultas
- `listTransactions`: lista transacciones por tipo.
- `listPrimaryConceptsByTransactionIds`: obtiene concepto principal por transacción.
- `listTransactionsByProject`: lista transacciones por proyecto.
- `getTransactionById`: obtiene encabezado de transacción.
- `listTransactionDetails`: obtiene líneas de transacción.
- `listPendingDeliveryInvoices`: lista facturas con pendiente de entrega.
- `listReturnableSaleDetails`: líneas retornables de una factura.
- `listInventoryDeliveryHistory`: historial de entregas por factura.
- `listPaymentsForTransaction`: pagos aplicados a un documento.
- `listTransactionsByAccountPaymentForm`: movimientos de una cuenta bancaria/caja/tarjeta.
- `listUsedTransactionTags`: catálogo de tags usados.
- `listInternalObligations`: obligaciones internas.
- `listInternalObligationsForReport`: obligaciones internas para reporte.
- `listEmployeeLoans`: préstamos a empleados.
- `listEmployeeLoansForReport`: reporte de préstamos.
- `getEmployeeLoanDisbursementBySourceId`: localiza desembolso ligado.
- `listBankDeposits`: depósitos bancarios.
- `getBankDepositGroup`: obtiene grupo de depósito.
- `listBankTransfers`: traslados bancarios.
- `listCashWithdrawals`: retiros de efectivo.

### CRUD base de transacciones
- `createTransactionWithDetails`: crea encabezado + múltiples líneas.
- `createTransactionWithDetail`: wrapper para una sola línea.
- `updateTransaction`: actualiza encabezado.
- `updateTransactionWithDetails`: actualiza encabezado y reemplaza líneas.
- `deactivateTransaction`: baja lógica.

### Inventario / entregas / devoluciones
- `createSaleReturnTransaction`: crea devolución de factura.
- `registerInventoryDelivery`: registra entrega posterior y escribe historial.
- `syncInitialInvoiceDeliveryHistory`: sincroniza entregado inicial de factura hacia historial.

### Pagos
- `registerPaymentForTransaction`: registra pago aplicado.
- `voidPaymentForTransaction`: anula pago aplicado.
- `reconcileTransaction`: marca conciliada.
- `unreconcileTransaction`: revierte conciliación.

### Obligaciones / préstamos
- `createInternalObligation`: crea obligación interna.
- `updateInternalObligation`: actualiza obligación interna.
- `createEmployeeLoan`: crea préstamo de empleado.
- `updateEmployeeLoan`: actualiza préstamo.
- `registerEmployeeLoanPayment`: registra pago de préstamo.
- `deactivateEmployeeLoanGroup`: anula grupo de préstamo.

### Movimientos bancarios especiales
- `createBankDeposit`: crea grupo de depósito.
- `updateBankDepositGroup`: actualiza grupo de depósito.
- `deactivateBankDepositGroup`: anula grupo de depósito.
- `createBankTransfer`: crea traslado entre bancos.
- `deactivateBankTransfer`: anula traslado.
- `createCashWithdrawal`: crea retiro de efectivo.
- `deactivateCashWithdrawal`: anula retiro.

## Utilidades y contexto
### `src/utils/accessControl.js`
- `resolveReadModuleByPath`: qué módulo controla una ruta.
- `resolveAccountSectionByPath`: qué sección de cuenta controla una ruta administrativa.

### `src/utils/dateFormat.js`
- `formatDate`
- `formatDateTime`

### `src/utils/numberFormat.js`
- `formatNumber`

### `src/utils/paymentFormLabel.js`
- `formatPaymentFormLabel`

### `src/contexts/AuthContext.jsx`
- `AuthProvider`
- `useAuth`

### `src/contexts/I18nContext.jsx`
- `I18nProvider`
- `useI18n`

### `src/hooks/useModulePermissions.js`
- `useModulePermissions`
