# Handoff

## Propósito de este archivo
Resumen corto para retomar rápido. El detalle completo ahora vive en:
- `docs/index.md`
- `docs/overview.md`
- `docs/frontend-map.md`
- `docs/services-map.md`
- `docs/supabase-map.md`
- `docs/glossary.md`
- `docs/transactions-and-reports.md`
- `docs/sql-runbook.md`
- `docs/release-checklist.md`

## Estado actual
Sistema operativo y funcional en React + Supabase con módulos principales:
- Dashboard
- Ventas
- Cuentas por cobrar
- Cuentas por pagar
- Otros ingresos / gastos
- Inventario
- Efectivo
- Bancos y tarjetas de crédito
- Planificación
- Reportes
- Gestión de cuenta y perfiles

## Cambios funcionales relevantes ya implementados
- Distinción entre `Producto` y `Servicio`.
- Compras de mercadería sin concepto manual adicional.
- Ajuste de inventario de mercadería.
- Pendientes de entrega con cantidad entregada separada.
- Módulo de entrega de mercadería.
- Historial de entregas (`inventory_delivery_history`).
- Devoluciones de factura.
- Facturas/compras para saldo anterior.
- CxC/CxP manuales con comentarios.
- Registro y anulación de pagos aplicados.
- Reportes de CxC/CxP al corte.
- Reporte de planilla.
- Reporte Kardex en migración hacia historial de entregas.
- Flujo de caja alineado con saldos bancarios/cajas y depósitos bancarios.
- Edición de depósitos bancarios.
- Conciliación bancaria con exportación compatible con Excel.

## Cambios técnicos relevantes ya implementados
- `ReadOnlyField` reutilizable.
- `ToggleSwitch` reutilizable.
- Protección de rutas y menús por permisos.
- Modal de bienvenida de cuenta y modal de cambio de cuenta.
- Alerta de cuenta relacionada.
- Remonte del contenido al cambiar de cuenta para refrescar estado local.
- Documentación interna ampliada para migración de entorno.

## Riesgos / puntos sensibles
- Cualquier cambio en reportes suele requerir tocar también `export-report`.
- Cualquier cambio en pagos puede requerir tocar:
  - frontend
  - `transactionsService`
  - SQL de validación de pagos en Supabase
- Cualquier cambio en inventario puede afectar:
  - ventas
  - compras
  - entrega de mercadería
  - kardex
  - reportes

## Archivos más sensibles
- `src/contexts/AuthContext.jsx`
- `src/components/Layout.jsx`
- `src/pages/TransactionCreatePage.jsx`
- `src/pages/TransactionsPage.jsx`
- `src/pages/ReportsPage.jsx`
- `src/services/transactionsService.js`
- `src/services/reportsService.js`
- `supabase/functions/export-report/index.ts`
- `supabase/payment_forms_and_ap.sql`
- `supabase/rls.sql`

## Últimas correcciones relevantes
- Conciliación bancaria usa signo normalizado y exporta Excel compatible.
- Auto-conciliación sólo cuando la forma de pago es `bank_account`.
- Flujo de caja y dashboard incluyen transferencias bancarias en el saldo por cuenta.
- Kardex y stock se vienen alineando con `inventory_delivery_history`.
- Precio unitario en factura/compra permite múltiples decimales.
- Reportes con alto volumen ahora deben paginar lecturas de Supabase para evitar truncamiento en 1000 filas.

## Handoff técnico: paginación de reportes
### Problema encontrado
- Supabase/PostgREST devuelve resultados paginados por defecto.
- En el reporte de flujo de caja de `accountId = 8`, el saldo de `Caja chica` quedaba mal porque la consulta solo estaba leyendo las primeras `1000` filas.
- Las transacciones `1591`, `1592` y `1593` quedaban fuera del dataset y el saldo mostraba `25090` en vez de `21251`.

### Qué se hizo
- En `src/services/reportsService.js` se agregó el helper `fetchAllPages(...)`.
- Ese helper ya se usa para que los reportes del frontend lean todas las páginas necesarias en consultas que pueden crecer:
  - flujo de caja
  - saldos de caja
  - CxC/CxP al corte
  - ventas por empleado
  - gastos por etiqueta y forma de pago
  - planilla
  - pendientes de entrega
  - y listados base de reportes que dependan de transacciones o detalles
- En `supabase/functions/export-report/index.ts` se agregó el mismo patrón `fetchAllPages(...)` para mantener la exportación alineada con pantalla.

### Regla para cualquier reporte nuevo
- Si el reporte consulta `transactions`, `transactionDetails`, `inventory_delivery_history`, `employee_absences`, `employes` o cualquier tabla que pueda superar `1000` filas, no usar una sola lectura directa.
- Usar siempre un helper de paginación con `.range(from, to)` y acumular páginas hasta recibir un lote menor al tamaño configurado.
- Aplicar esta regla tanto en:
  - `src/services/reportsService.js`
  - `supabase/functions/export-report/index.ts`
- No asumir que “por cuenta no habrá tantos registros”; este incidente ya probó que sí ocurre en producción.

### Checklist para futuros reportes
- Confirmar si la consulta principal puede superar `1000` filas.
- Confirmar si las consultas secundarias también pueden crecer:
  - detalles
  - pagos aplicados
  - historial de entregas
  - agrupaciones por empleado / cliente / producto
- Si el reporte existe en pantalla y exportación, aplicar el mismo patrón en ambas.
- Validar un caso real con más de `1000` filas antes de cerrar.

## Recomendación operativa
Antes de tocar módulos financieros, leer:
- `AGENTS.md`
- `docs/index.md`
- `docs/overview.md`
- `docs/frontend-map.md`
- `docs/services-map.md`
- `docs/supabase-map.md`
- `docs/glossary.md`
- `docs/transactions-and-reports.md`
- `docs/sql-runbook.md`
- `docs/release-checklist.md`
- `docs/decisions.md`
- `docs/domain-rules.md`
- `docs/pending.md`
