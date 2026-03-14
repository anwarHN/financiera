# Handoff

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
- Reporte kardex.
- Flujo de caja alineado con saldos bancarios/cajas y depósitos bancarios.
- Edición de depósitos bancarios.

## Cambios técnicos relevantes ya implementados
- `ReadOnlyField` reutilizable con soporte para:
  - text
  - number
  - currency
  - date
  - datetime
  - boolean
  - email
  - phone
  - multiline
- `ToggleSwitch` reutilizable.
- Protección de rutas y menús por permisos.
- Modal de bienvenida de cuenta y modal de cambio de cuenta.
- Alerta de cuenta relacionada.
- Remonte del contenido al cambiar de cuenta para refrescar estado local.

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
- Modal de bienvenida de cuenta sólo debe aparecer en login real, no en refresh.
- Cambio de cuenta debe refrescar formularios/picklists al remontar contenido por `accountId`.
- Depósitos bancarios ya pueden editarse.
- El shell del layout se reestructuró para evitar espacio fantasma entre banner y contenido.
- Lista de reportes ajustada visualmente.

## Recomendación operativa
- Antes de tocar módulos financieros, leer:
  - `AGENTS.md`
  - `docs/decisions.md`
  - `docs/domain-rules.md`
  - `docs/pending.md`
