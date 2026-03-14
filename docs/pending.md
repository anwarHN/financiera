# Pendientes

## Alta prioridad
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
- Kardex usa fecha de factura para salidas cuando la entrega no se guarda como movimiento de inventario independiente.
- Si se requiere kardex exacto por fecha de entrega, falta un modelo de movimientos de inventario por evento.

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
