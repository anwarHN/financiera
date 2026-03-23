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
