# Release Checklist

## Objetivo
Checklist corto para cerrar cambios y desplegar con menor riesgo.

## Checklist general
- `npm run build`
- revisar rutas críticas afectadas
- revisar permisos visibles y acceso por URL
- revisar cambio de cuenta si la pantalla usa picklists o lookups
- revisar que no haya textos rotos en español/inglés si se tocaron traducciones

## Si se tocaron reportes
- validar pantalla de reporte
- validar exportación en `supabase/functions/export-report/index.ts`
- validar signos, totales y agrupaciones
- validar columnas exportadas

## Si se tocó inventario
- validar compra
- validar factura
- validar entrega posterior
- validar Kardex
- validar inventario actual
- validar inventario disponible
- validar pendiente de entrega

## Si se tocaron pagos
- validar registro de pago
- validar anulación de pago
- validar balance recalculado
- validar trigger SQL asociado
- validar mensajes de error y redondeo

## Si se tocó conciliación bancaria
- validar auto-conciliación en transacciones bancarias
- validar saldo anterior, movimientos y saldo actual
- validar exportación Excel si aplica
- validar que solo considere transacciones activas

## Si se tocó multiempresa
- validar cambio de cuenta
- validar refresh de picklists
- validar que no persista estado viejo
- validar que la cuenta incorrecta no filtre datos cruzados

## Si se tocó permisos
- validar menú
- validar acciones de fila
- validar ruta directa
- validar reportes visibles por perfil

## Si se tocó SQL o Supabase
- validar archivo SQL afectado
- validar RLS si corresponde
- validar funciones Edge relacionadas
- documentar en `handoff.md` o `docs/pending.md` si quedó algo abierto

## Cierre recomendado
- actualizar `handoff.md` si el cambio es relevante
- actualizar `docs/decisions.md` si se tomó una decisión de diseño
- actualizar `docs/pending.md` si quedó deuda o riesgo
