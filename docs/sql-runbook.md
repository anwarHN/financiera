# SQL Runbook

## Objetivo
Guía operativa para ejecutar scripts SQL, migraciones manuales y validaciones en Supabase sin perder consistencia de datos.

## Principios
- No ejecutar scripts destructivos sin respaldo previo.
- Ejecutar primero `select` de validación y luego `update` o `delete`.
- Si el cambio afecta reportes, revisar también frontend y `export-report`.
- Si el cambio afecta inventario, validar por detalle y por producto.
- Si el cambio afecta pagos, revisar triggers, balances y pagos activos.
- En multiempresa, filtrar por `accountId` cuando el script no es global.

## Orden recomendado antes de correr SQL en producción
1. Leer `docs/supabase-map.md`.
2. Leer `docs/decisions.md` y `docs/domain-rules.md` si el cambio es funcional.
3. Identificar tablas, triggers y funciones afectadas.
4. Preparar query de validación previa.
5. Preparar query de validación posterior.
6. Ejecutar primero en entorno de prueba si existe.

## Checklist previo a ejecutar una migración manual
- Confirmar el archivo SQL exacto.
- Confirmar si la migración es idempotente.
- Confirmar si requiere backfill adicional.
- Confirmar si requiere cambio simultáneo en frontend.
- Confirmar si requiere cambio simultáneo en Edge Function.
- Tener un `select` de auditoría antes y después.

## Casos frecuentes
### RLS o permisos
Revisar:
- `supabase/rls.sql`
- `supabase/profiles_permissions_modules.sql`

Validar:
- usuario correcto por cuenta
- visibilidad real por `accountId`
- acceso de lectura y escritura

### Pagos
Revisar:
- `supabase/payment_forms_and_ap.sql`
- `src/services/transactionsService.js`

Validar:
- pagos activos vs anulados
- balances recalculados
- redondeo a 2 decimales cuando aplica
- textos de error correctos

### Inventario y entregas
Revisar:
- `supabase/inventory_pending_deliveries.sql`
- `supabase/inventory_delivery_history.sql`
- `supabase/inventory_delivery_history_backfill.sql`
- `src/services/conceptsService.js`
- `src/services/transactionsService.js`

Validar:
- entregado por detalle
- entregado por historial
- pendiente por producto
- Kardex por producto
- inventario actual vs disponible

### Reportes
Revisar:
- `src/services/reportsService.js`
- `supabase/functions/export-report/index.ts`

Validar:
- mismos filtros
- misma lógica de agregación
- mismos nombres de columnas y signos

## Estrategia para backfills
1. Agregar campos/índices primero.
2. Normalizar datos existentes si hace falta.
3. Insertar o actualizar backfill.
4. Validar por detalle.
5. Validar por producto o agregado.
6. Solo después cambiar la lógica de aplicación.
7. Cuando la nueva lógica esté estable, retirar fallback si aplica.

## Ejemplo: inventario_delivery_history_backfill
Objetivo:
- migrar `historicalQuantityDelivered` hacia `inventory_delivery_history`
- solo para facturas activas

Orden recomendado:
1. agregar columnas `isInferred` y `source`
2. normalizar filas existentes
3. insertar filas `historical_migration`
4. correr validación por detalle
5. correr validación por producto
6. desplegar cambio de frontend que lea historial como fuente principal

## Qué documentar después de correr SQL
- fecha de ejecución
- entorno donde se ejecutó
- archivo o script exacto
- validaciones previas y posteriores
- si quedó algún fallback vivo en aplicación

## No hacer
- no borrar históricos sin validar diferencias antes
- no tocar RLS sin revisar impacto en `AuthContext` y servicios
- no asumir que un trigger nuevo reemplaza validaciones del frontend
- no mezclar backfill de compras y facturas cuando el modelo sólo aplica a facturas
