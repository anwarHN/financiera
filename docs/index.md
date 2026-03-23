# Índice de documentación

## Propósito
Este índice existe para que otra persona u otro agente pueda orientarse rápido en el proyecto sin depender del historial del chat.

## Orden recomendado de lectura
### 1. `handoff.md`
Leer primero para entender estado actual, riesgos y últimos cambios relevantes.

### 2. `docs/overview.md`
Leer después para entender:
- qué hace el producto
- stack
- configuración general
- términos de UI y arquitectura

### 3. `docs/glossary.md`
Leer temprano si aparecen términos internos como:
- `icons-menu`
- `app-menu`
- `actions-menu`
- `CxC`
- `CxP`
- `saldo anterior`
- `deliveryBatchKey`

### 4. `docs/frontend-map.md`
Usar cuando se necesite ubicar:
- páginas
- componentes
- contextos
- hooks
- utilidades de UI

### 5. `docs/services-map.md`
Usar cuando se necesite saber:
- qué servicio toca qué módulo
- qué función exportada hace cada operación
- dónde vive la lógica de negocio del frontend

### 6. `docs/supabase-map.md`
Usar cuando se toquen:
- tablas
- RLS
- SQL
- Edge Functions
- inventario, pagos, conciliación, billing

### 7. `docs/decisions.md`
Usar para entender por qué el sistema se modeló de cierta forma.

### 8. `docs/domain-rules.md`
Usar para reglas de negocio que no conviene romper.

### 9. `docs/transactions-and-reports.md`
Usar para entender tipos de transacción, signos operativos y funcionamiento de reportes.

### 10. `docs/pending.md`
Usar para pendientes, riesgos y deuda técnica conocida.

### 11. `docs/sql-runbook.md`
Usar antes de ejecutar cambios SQL o migraciones manuales en Supabase.

### 12. `docs/release-checklist.md`
Usar antes de desplegar o cerrar cambios relevantes.

## Ruta de lectura según tarea
### Si vas a tocar UI
1. `docs/glossary.md`
2. `docs/frontend-map.md`
3. `docs/services-map.md`
4. `handoff.md`

### Si vas a tocar reportes
1. `docs/services-map.md`
2. `docs/supabase-map.md`
3. `docs/decisions.md`
4. revisar también `supabase/functions/export-report/index.ts`

### Si vas a tocar permisos o cuenta activa
1. `docs/frontend-map.md`
2. `docs/supabase-map.md`
3. `docs/domain-rules.md`
4. revisar `src/contexts/AuthContext.jsx` y `src/components/Layout.jsx`

### Si vas a tocar inventario o entregas
1. `docs/domain-rules.md`
2. `docs/decisions.md`
3. `docs/services-map.md`
4. `docs/supabase-map.md`
5. revisar `supabase/inventory_*.sql`

### Si vas a tocar pagos o conciliación bancaria
1. `docs/domain-rules.md`
2. `docs/services-map.md`
3. `docs/supabase-map.md`
4. revisar `supabase/payment_forms_and_ap.sql`

### Si vas a tocar base de datos
1. `docs/supabase-map.md`
2. `docs/sql-runbook.md`
3. `docs/decisions.md`
4. `docs/pending.md`

## Convenciones para otro agente
- Si un cambio afecta reportes, validar pantalla y exportación.
- Si un cambio afecta tenant/cuenta, validar `accountId` y cambio de cuenta.
- Si un cambio afecta pagos, revisar frontend y SQL.
- Si un cambio afecta inventario, revisar compras, ventas, entregas, Kardex y reportes.
- No asumir que un valor persistido como `balance` o `quantityDelivered` es suficiente sin revisar lógica derivada.

## Archivos de entrada rápida más sensibles
- `src/contexts/AuthContext.jsx`
- `src/components/Layout.jsx`
- `src/pages/TransactionCreatePage.jsx`
- `src/services/transactionsService.js`
- `src/services/reportsService.js`
- `src/services/conceptsService.js`
- `supabase/functions/export-report/index.ts`
- `supabase/rls.sql`
- `supabase/payment_forms_and_ap.sql`
