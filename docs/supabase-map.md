# Mapa de base de datos, SQL, RLS y Edge Functions

## Base de datos: visión general
La base es multiempresa y la mayoría de tablas operativas dependen de `accountId`.
RLS está habilitado y se apoya en la función:
- `public.user_belongs_to_account(target_account_id bigint)`

Archivo principal de RLS:
- `supabase/rls.sql`

## RLS
`supabase/rls.sql` hace tres cosas principales:
1. habilita RLS en tablas tenant
2. define la función `user_belongs_to_account`
3. crea políticas `..._tenant_access`

Tablas con RLS relevante:
- `accounts`
- `usersToAccounts`
- `persons`
- `concepts`
- `contacts`
- `currencies`
- `employes`
- `transactions`
- `transactionDetails`
- `projects`
- `budgets`
- `budget_lines`
- `appointments`
- `employee_availability`
- `employee_absences`
- `inventory_delivery_history`
- además otras tablas creadas por migraciones posteriores como `account_payment_forms` y `payment_methods`

## SQL por archivo
### Cuenta / personas / auth
- `account_contact_fields.sql`: campos extra de contacto/cuenta.
- `auth_signup_trigger.sql`: trigger de signup y bootstrap inicial.
- `admin_profiles.sql`: perfiles administrativos/sistémicos.
- `profiles_permissions_modules.sql`: perfiles, permisos por módulo y acceso por reporte.
- `invitations_expiration.sql`: expiración de invitaciones.

### Catálogos y estructura base
- `product_types.sql`: distingue producto vs servicio.
- `transactions_tags.sql`: soporte para tags en transacciones.
- `transactions_employee.sql`: relación transacción-empleado y payroll.
- `employees_is_active.sql`: bandera activa en empleados.
- `employees_salary_payroll.sql`: salario y payroll.
- `appointments.sql`: citas.
- `employee_availability_absences.sql`: disponibilidad y ausencias.
- `projects_and_budgets.sql`: proyectos, presupuestos y líneas.

### Pagos / bancos / cajas
- `payment_forms_and_ap.sql`: métodos de pago, formas de pago, validación de pagos, conceptos sistémicos.
- `cash_withdrawals.sql`: retiros de efectivo.
- `cashboxes_internal_payable_fix.sql`: ajuste relacionado con cajas/obligaciones internas.
- `internal_account_payables.sql`: obligaciones internas.
- `reconciliation_date_only.sql`: soporte de conciliación por fecha.

### Inventario
- `inventory_pending_deliveries.sql`: `pendingDelivery` y `quantityDelivered` en detalles.
- `inventory_delivery_history.sql`: historial de entregas por lote/fecha.
- `inventory_delivery_history_backfill.sql`: metadatos + backfill de `historicalQuantityDelivered` hacia historial inferido.

### Empleados / préstamos
- `employee_loans.sql`: préstamos a empleados.

### Billing / membresía
- `membership_paypal.sql`
- `membership_stripe.sql`

### Reportes
- `report_exports.sql`: soporte general de exportaciones.

## Tablas operativas más importantes
### `transactions`
Encabezado de documentos financieros y operativos.
Campos importantes usados por el frontend:
- `type`
- `total`, `payments`, `balance`
- `personId`, `employeeId`, `projectId`
- `paymentMethodId`, `accountPaymentFormId`
- `isAccountReceivable`, `isAccountPayable`
- `isIncomingPayment`, `isOutcomingPayment`
- `isInternalTransfer`, `isDeposit`, `isCashWithdrawal`
- `isReconciled`, `reconciledAt`
- `tags`
- `isActive`

### `transactionDetails`
Líneas de cada transacción.
Campos importantes:
- `conceptId`
- `quantity`
- `quantityDelivered`
- `historicalQuantityDelivered` (si ya fue agregado/aplicado en la base)
- `pendingDelivery`
- `price`, `net`, `tax`, `discount`, `total`, `additionalCharges`
- `transactionPaidId` para pagos y devoluciones enlazadas

### `concepts`
Catálogo de productos, servicios, conceptos contables y conceptos sistémicos.
Flags frecuentes:
- `isProduct`
- `isIncome`
- `isExpense`
- `isGroup`
- `isAccountPayableConcept`
- `isIncomingPaymentConcept`
- `isOutgoingPaymentConcept`
- `isSystem`
- `productType`

### `persons`
Clientes y proveedores.

### `account_payment_forms`
Cajas, cuentas bancarias y tarjetas de crédito.
Campo clave:
- `kind` in (`cashbox`, `bank_account`, `credit_card`)

### `payment_methods`
Métodos de pago lógicos.
Ejemplos:
- cash
- card
- bank_transfer

### `inventory_delivery_history`
Historial de entregas por detalle de factura.
Campos actuales relevantes:
- `accountId`
- `transactionId`
- `transactionDetailId`
- `conceptId`
- `deliveryBatchKey`
- `deliveryDate`
- `quantity`
- `createdAt`
- opcionalmente, tras backfill:
  - `isInferred`
  - `source`

## Edge Functions
### `export-report`
Genera datasets y archivo exportable para reportes.
Es la más sensible: cualquier cambio importante de reportes suele requerir tocarla.

### `send-invitation`
Crea y envía invitaciones a usuarios compartidos.

### `accept-shared-invitation`
Acepta invitación y vincula usuario a cuenta.

### `list-account-users`
Lista usuarios de la cuenta.

### `list-pending-invitations`
Lista invitaciones pendientes del usuario actual.

### `deactivate-account-user`
Desactiva usuario compartido.

### Billing
- `create-billing-checkout`
- `create-billing-portal`
- `create-billing-setup-session`
- `list-billing-payment-methods`
- `set-default-billing-payment-method`
- `sync-billing-seats`
- `stripe-webhook`

## Reglas importantes de inventario
- Kardex y stock agregado se están migrando a usar `inventory_delivery_history` como fuente principal de salidas.
- `historicalQuantityDelivered` debe considerarse dato de transición si ya existe.
- Las entregas nuevas deben llegar a `inventory_delivery_history` sólo desde facturas activas.

## Reglas importantes de conciliación bancaria
- Una transacción debe auto-conciliarse sólo si la `accountPaymentForm` es `bank_account`.
- `reconciledAt` debe quedar con la misma fecha de la transacción/pago cuando aplica auto-conciliación.

## Relación entre frontend y SQL
Cuando se toca alguno de estos temas, revisar siempre ambos lados:
- pagos: `src/services/transactionsService.js` + `supabase/payment_forms_and_ap.sql`
- reportes: `src/services/reportsService.js` + `supabase/functions/export-report/index.ts`
- inventario: `src/services/conceptsService.js`, `src/services/transactionsService.js`, `supabase/inventory_*`
- permisos: `src/contexts/AuthContext.jsx`, `src/components/Layout.jsx`, `supabase/profiles_permissions_modules.sql`, `supabase/rls.sql`
