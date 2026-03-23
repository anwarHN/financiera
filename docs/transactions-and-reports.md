# Tipos de transacción, signos y funcionamiento de reportes

## Objetivo
Explicar:
- qué tipos de transacción maneja el sistema
- cómo se representan desde el código
- cuándo se interpretan como positivo o negativo
- cómo funciona cada reporte y qué servicio lo alimenta

## Dónde se define el enum de tipos
Archivo principal:
- `src/services/transactionsService.js`

Constante:
```js
export const TRANSACTION_TYPES = {
  sale: 1,
  expense: 2,
  income: 3,
  purchase: 4,
  outgoingPayment: 5,
  incomingPayment: 6
};
```

## Regla importante sobre signos
En base de datos, muchas transacciones se guardan con `total` positivo.
El signo operativo no siempre viene persistido; muchas pantallas y reportes lo reinterpretan según:
- `type`
- `isIncomingPayment`
- `isOutcomingPayment`
- `isAccountReceivable`
- `isAccountPayable`
- `isInternalTransfer`
- `isDeposit`
- `isCashWithdrawal`
- `tags`

Eso significa que el signo financiero real se define en servicios como:
- `src/services/reportsService.js`
- `src/pages/BankReconciliationPage.jsx`
- `src/services/conceptsService.js`

## Tipos de transacción
### `sale` = 1
Uso:
- factura de venta
- factura de saldo anterior
- ventas con o sin inventario

Pantallas principales:
- `src/pages/TransactionsPage.jsx`
- `src/pages/TransactionCreatePage.jsx`
- `src/pages/TransactionDetailPage.jsx`
- `src/pages/InventoryDeliveriesPage.jsx`

Reglas:
- puede ser de contado o crédito
- puede marcar `isAccountReceivable`
- puede llevar productos o servicios
- si el producto no se entrega completo, queda pendiente de entrega
- la salida real de inventario depende de lo entregado, no sólo de lo facturado

Signo operativo:
- en ventas y cashflow: positivo
- en Kardex: no sale inventario por el total de la factura, sólo por las cantidades entregadas
- si tiene tag `__prior_balance__`, el Kardex y stock no deben tratarla como salida real automática

### `expense` = 2
Uso:
- gastos operativos
- ajustes de inventario cuando llevan tag `__inventory_adjustment__`
- otros egresos no clasificados como compra

Pantallas principales:
- `src/pages/TransactionsPage.jsx`
- `src/pages/TransactionCreatePage.jsx`

Reglas:
- puede afectar flujo de caja si se paga
- si es ajuste de inventario, puede afectar inventario según el signo de `transactionDetails.quantity`

Signo operativo:
- en cashflow: negativo
- en Kardex: si es ajuste de inventario, el signo lo define la cantidad del detalle

### `income` = 3
Uso:
- otros ingresos distintos de ventas
- ingresos operativos sin lógica de inventario

Signo operativo:
- en cashflow: positivo
- no afecta inventario

### `purchase` = 4
Uso:
- compra de mercadería
- compra de saldo anterior

Reglas:
- puede ser de contado o crédito
- puede marcar `isAccountPayable`
- si es compra de mercadería, aumenta inventario

Signo operativo:
- en flujo de caja: negativo
- en Kardex e inventario: entrada positiva

### `outgoingPayment` = 5
Uso:
- pago saliente
- reduce CxP
- también se usa en grupos especiales como depósitos, traslados, retiros o pagos de préstamos/obligaciones

Reglas:
- puede ligarse a una cuenta por pagar mediante `transactionDetails.transactionPaidId`
- si se registra contra cuenta bancaria, puede quedar conciliado automáticamente

Signo operativo:
- en cashflow: negativo
- no afecta inventario

### `incomingPayment` = 6
Uso:
- pago entrante
- reduce CxC
- puede ser cobro de factura, de cuenta por cobrar manual o de préstamo

Reglas:
- puede ligarse a una cuenta por cobrar mediante `transactionDetails.transactionPaidId`
- si se registra contra cuenta bancaria, puede quedar conciliado automáticamente

Signo operativo:
- en cashflow: positivo
- no afecta inventario

## Banderas que cambian el comportamiento
### `isAccountReceivable`
Hace que la transacción represente una cuenta por cobrar o una venta al crédito.
No debe tratarse como flujo de caja al momento del registro inicial.

### `isAccountPayable`
Hace que la transacción represente una cuenta por pagar o una compra al crédito.
No debe tratarse como flujo de caja al momento del registro inicial.

### `isIncomingPayment`
Marca que la transacción es un pago entrante.
En reportes bancarios y cashflow se interpreta como positivo.

### `isOutcomingPayment`
Marca que la transacción es un pago saliente.
En reportes bancarios y cashflow se interpreta como negativo.

### `isInternalTransfer`
Marca movimiento interno entre cuentas.
No debe tratarse como ingreso o gasto operativo, pero sí afecta saldo por cuenta bancaria.

### `isDeposit`
Marca depósito bancario.
No es ingreso operativo; mueve saldo entre caja y banco.

### `isCashWithdrawal`
Marca retiro de efectivo desde banco a caja.
No es gasto operativo; mueve saldo entre banco y caja.

### `isReconciled` y `reconciledAt`
Se usan en conciliación bancaria.
Una transacción debe auto-conciliarse sólo cuando la forma de pago concreta es `bank_account`.

## Tags relevantes
### `__prior_balance__`
Documento histórico de arrastre.
No debe tratarse como movimiento operativo normal de inventario o cashflow si la lógica del módulo lo excluye.

### `__inventory_adjustment__`
Ajuste de inventario.
El signo del movimiento lo define la cantidad del detalle.

### `__sale_return__`
Devolución de venta.
Debe reintegrar inventario cuando aplica.

### `__manual_receivable__`
Cuenta por cobrar manual.

### `__manual_payable__`
Cuenta por pagar manual.

## Cómo se usan los tipos desde el código
### Listados y módulos
`src/pages/TransactionsPage.jsx` lista transacciones por tipo llamando a:
- `listTransactions(...)`

### Creación y edición
`src/pages/TransactionCreatePage.jsx` arma payloads distintos según el módulo actual:
- venta
- compra
- ingreso
- gasto
- CxC manual
- CxP manual
- ajuste de inventario

El tipo se persiste en `transactions.type` y luego otras banderas complementan el comportamiento.

### Pagos
`src/pages/TransactionPaymentPage.jsx` y `src/components/PaymentRegisterModal.jsx` crean pagos usando:
- `registerPaymentForTransaction(...)`

### Inventario
`src/services/conceptsService.js` interpreta inventario así:
- compras: entrada
- ajustes: entrada o salida según signo
- ventas: salida sólo por entrega real

### Reportes
`src/services/reportsService.js` normaliza signo y filtra tipos según el reporte.
Por eso no basta con leer `transactions.total` crudo.

## Regla de signo usada en cashflow y saldos bancarios
En `src/services/reportsService.js` la normalización es:
- `isIncomingPayment` => positivo
- `isOutcomingPayment` => negativo
- `type === 1` o `type === 3` => positivo
- `type === 2` o `type === 4` => negativo

Esa misma lógica debe mantenerse alineada en:
- conciliación bancaria
- saldos por cuenta bancaria
- dashboard bancario
- exportaciones relacionadas

## Reportes disponibles

### `sales`
Pantalla:
- `src/pages/ReportsPage.jsx`

Servicio:
- `getTransactionsForReports(...)`

Qué muestra:
- transacciones de tipo venta
- total y cargos adicionales agregados

Filtros:
- fecha desde / hasta
- moneda

Signo:
- positivo

### `expenses`
Servicio:
- `getTransactionsForReports(...)`

Qué muestra:
- transacciones de tipo gasto

Filtros:
- fecha desde / hasta
- moneda

Signo:
- se muestran como transacciones de gasto; en cashflow se interpretan negativas, pero en este listado el total del documento se presenta como monto del gasto

### `receivable`
Servicio:
- `getOutstandingTransactionsForReports(...)`

Qué muestra:
- documentos con saldo pendiente por cobrar al corte
- agrupa por cliente

Reglas:
- usa fecha `hasta`
- calcula saldo real restando sólo pagos activos aplicados
- no depende ciegamente del `balance` persistido

### `payable`
Servicio:
- `getOutstandingTransactionsForReports(...)`

Qué muestra:
- documentos con saldo pendiente por pagar al corte
- agrupa por proveedor

Reglas:
- mismas reglas de `receivable`, pero sobre `isAccountPayable`

### `internal_obligations`
Servicio:
- `listInternalObligationsForReport(...)`

Qué muestra:
- obligaciones internas vigentes dentro del rango/moneda

### `budget_execution`
Servicio:
- `getBudgetExecutionReport(...)`

Qué muestra:
- ejecución de un presupuesto específico
- presupuesto, ejecutado y variación por concepto

Filtros:
- presupuesto
- opcionalmente rango de fechas

Nota:
- es reporte de pantalla; no entra en la exportación general actual

### `project_execution`
Servicio:
- `getProjectExecutionReport(...)`

Qué muestra:
- ejecución financiera de un proyecto
- presupuesto, ejecutado y variación

Nota:
- igual que `budget_execution`, es principalmente de pantalla

### `cashflow`
Servicios:
- `getCashflowConceptTotals(...)`
- `getCashflowBankBalances(...)`
- `getCashflowOutstandingBalanceSummary(...)`

Qué muestra:
- ingresos y gastos agrupados por grupo y concepto
- saldo anterior, movimientos del período y saldo neto
- saldos por cuenta bancaria/caja/efectivo sin caja
- resumen de CxC y CxP al corte

Reglas:
- excluye CxC/CxP como compromiso inicial
- sí incluye pagos
- excluye ajustes de inventario
- excluye saldo anterior
- depósitos, retiros y transferencias no son ingreso/gasto operativo, pero sí afectan saldo por cuenta

Exportación:
- debe mantenerse alineada con `supabase/functions/export-report/index.ts`

### `employee_absences`
Servicio:
- `getEmployeeAbsenceTotals(...)`

Qué muestra:
- ausencias por empleado en el rango

### `sales_by_employee`
Servicio:
- `getSalesByEmployeeTotals(...)`

Qué muestra:
- ventas agrupadas por empleado y producto

### `expenses_by_tag_payment_form`
Servicio:
- `getExpensesByTagAndPaymentForm(...)`

Qué muestra:
- gastos agrupados por etiqueta y forma de pago

### `employee_loans`
Servicio:
- `getEmployeeLoansReport(...)`

Qué muestra:
- préstamos a empleados y su estado dentro del rango

### `employee_payroll`
Servicio:
- `getEmployeePayrollReport(...)`

Qué muestra:
- planilla de empleados
- salario, ausencias, descuentos y total neto

### `cashboxes_balance`
Servicio:
- `getCashboxesBalanceReport(...)`

Qué muestra:
- saldo por caja y efectivo sin caja al corte

Reglas:
- es un reporte de saldo, no de ingreso/gasto operativo

### `pending_deliveries`
Servicio:
- `getPendingDeliveriesReport(...)`

Qué muestra:
- pendientes de entrega por cliente y producto, con subtotales

Reglas:
- usa historial de entregas como fuente primaria
- agrupa por cliente y luego por producto
- funciona al corte por fecha `hasta`

## Relación entre reportes y exportación
Cuando un reporte está soportado por exportación, se debe revisar también:
- `src/services/reportsService.js`
- `supabase/functions/export-report/index.ts`

Regla práctica:
- si cambias filtros, agrupación, signos o columnas en pantalla, debes revisar la exportación correspondiente

## Reportes que son sensibles a signo
Los más sensibles a interpretación de signo son:
- `cashflow`
- conciliación bancaria
- saldos de cuentas bancarias en home
- `cashboxes_balance`
- reportes de CxC/CxP al corte

## Riesgos frecuentes
- usar `transactions.total` sin normalizar signo
- tratar CxC/CxP como flujo de caja al crearse
- descontar inventario por factura en vez de por entrega real
- olvidar alinear pantalla y exportación
- olvidar excluir documentos con tag `__prior_balance__` cuando la lógica lo requiera
