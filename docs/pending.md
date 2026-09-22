# Pendientes

## Alta prioridad
- `src/services/budgetsService.js` no pagina lecturas de `transactionDetails`:
  - `getBudgetExecutionReport` (línea `109`) y `getProjectExecutionReport` (línea `158`).
  - Por encima de `1000` filas el ejecutado sale subestimado y la variación sale
    falsamente favorable. Mismo patrón del incidente de flujo de caja descrito en `handoff.md`.
  - `getProjectExecutionReport` además lee `transactionDetails` sin filtro de cuenta.
  - Detalle y criterios de aceptación en `docs/handoff-budget-control-eleven-studio.md`.
- Validar manualmente todos los formularios con picklists después de cambio de cuenta:
  - nueva factura
  - compra
  - aplicar pago
  - depósito bancario
  - préstamo a empleado
  - obligación interna
- Verificar si otros módulos además de depósitos bancarios necesitan edición de grupos enlazados:
  - traslados bancarios
  - retiros de efectivo

## Inventario
- Kardex todavía no consume `inventory_delivery_history` como fuente principal de salidas.
- Falta ejecutar y validar la migración de `historicalQuantityDelivered` hacia `inventory_delivery_history`.
- Después del backfill, alinear:
  - Kardex
  - pendientes de entrega operativos
  - inventario actual/disponible

## Reportes
- Validar con datos reales:
  - flujo de caja vs saldos bancarios/cajas
  - pendientes de entrega al corte
  - cuentas por cobrar/pagar al corte
- Revisar si el resumen superior de todos los reportes necesita más campos o distinto orden.

## UX / rendimiento
- El bundle principal sigue grande; Vite advierte chunks > 500 kB.
- Falta evaluar división por rutas o `manualChunks`.

## QA
- No hay suite formal de pruebas automatizadas para reglas críticas de negocio.
- Se recomienda agregar pruebas para:
  - cambio de cuenta
  - pagos y anulación de pagos
  - reportes al corte
  - entregas parciales
