# Handoff: control presupuestario para Eleven Studio

## Contexto y origen
Se contrató un servicio externo de control de gastos para el proyecto **Expo Feria de Marketing**
(Eleven Studio), con vigencia del **16 de septiembre al 16 de noviembre de 2026**. El servicio se
presta sobre Daime y su entregable semanal es un **reporte de ejecución presupuestaria en formato
Excel**.

La revisión de capacidades previa a la firma detectó tres cambios necesarios en Daime. Este
documento los describe para que puedan ejecutarse sin volver a recorrer el análisis.

Perfil de uso del usuario externo:
- Sólo registra y consulta. No aplica pagos, no anula, no ve planilla.
- Depende de los reportes `budget_execution` y `project_execution`.
- El acceso se otorga como cortesía y está limitado a ese proyecto.

## Resumen de cambios

| # | Cambio | Severidad | Bloquea el servicio |
|---|---|---|---|
| 1 | Paginación en `budgetsService.js` | **Crítica** | Sí — antes del 16 de septiembre |
| 2 | Exportación XLSX de ejecución presupuestaria y por proyecto | Alta | No, pero es el entregable ofertado |
| 3 | Moneda en presupuestos | Media | Sólo si hay proveedores en otra moneda |

---

## Cambio 1. Paginación en reportes de presupuesto (crítico)

### Problema
`src/services/budgetsService.js` lee `transactionDetails` **sin paginar**. PostgREST corta en
`1000` filas por defecto, así que por encima de ese volumen el **gasto ejecutado sale subestimado
y la variación sale falsamente favorable**.

Es exactamente el incidente ya documentado en `handoff.md` para flujo de caja (cuenta `8`, `Caja
chica` mostraba `25090` en vez de `21251`). En esa ocasión se creó el helper `fetchAllPages(...)`
en `src/services/reportsService.js:48` y se replicó en
`supabase/functions/export-report/index.ts`, pero **`budgetsService.js` nunca se corrigió**.

### Puntos afectados
- `src/services/budgetsService.js:87` — `getBudgetExecutionReport(...)`
  - Línea `109`-`111`: `.from("transactionDetails").select(...).in("conceptId", conceptIds)` sin
    `.range(...)`.
- `src/services/budgetsService.js:142` — `getProjectExecutionReport(...)`
  - Línea `158`: `.from("transactionDetails").select(...)` **sin filtro alguno y sin paginar**.
    Lee la tabla completa de todas las cuentas y se queda con las primeras `1000` filas.

### Qué hacer
1. Reutilizar el patrón `fetchAllPages(...)` de `src/services/reportsService.js:48`. Extraerlo a
   una utilidad compartida o replicarlo en `budgetsService.js`; no duplicar lógica divergente.
2. En `getProjectExecutionReport`, además de paginar, **filtrar en el servidor**. Hoy trae toda la
   tabla y descarta en memoria por `accountId`, `projectId` y fechas. Como mínimo debe acotarse por
   los `conceptId` presupuestados y por la relación con `transactions` de la cuenta activa.
3. Mantener intacta la normalización de signo existente (`isExpense` → `Math.abs`).

### Criterio de aceptación
- Con una cuenta que supere `1000` filas en `transactionDetails`, el total ejecutado del reporte
  coincide con la suma obtenida por SQL directo sobre las mismas condiciones.
- `getProjectExecutionReport` ya no descarga filas de otras cuentas.
- Reglas de `AGENTS.md` y de `handoff.md` sobre paginación quedan cumplidas también aquí.

---

## Cambio 2. Exportación XLSX de ejecución presupuestaria y por proyecto

### Problema
Los dos reportes que sostienen el servicio contratado **no se pueden exportar**:

- `src/pages/ReportsPage.jsx:547`
  `const canExportCurrentReport = !["budget_execution", "project_execution"].includes(selectedReport);`
  El botón de exportar se oculta para ambos.
- `supabase/functions/export-report/index.ts:10`-`23`: la unión de tipos `ExportPayload["reportId"]`
  **no incluye** `budget_execution` ni `project_execution`.
- `supabase/functions/export-report/index.ts:197`: `reportTitles` tampoco los contempla.
- `buildReportData(...)` (cerca de la línea `1534`) no tiene rama para ellos y caería en
  `buildStandardReport`, que no sabe construirlos.

### Lo que ya está resuelto
El frontend **ya envía** `budgetId` y `projectId` a la Edge Function. No hay que tocar el plumbing:

- `src/pages/ReportsPage.jsx:630` — `handleExport()` ya arma `budgetId` y `projectId`.
- `src/services/reportsService.js:828` — `exportReportXlsx({...budgetId, projectId...})`.
- `src/services/reportsService.js:875` — ya van dentro del `body` del POST.

### Qué hacer
1. `supabase/functions/export-report/index.ts`:
   - Agregar `"budget_execution"` y `"project_execution"` a la unión `ExportPayload["reportId"]`.
   - Declarar `budgetId?: number | null` y `projectId?: number | null` en `ExportPayload`.
   - Agregar títulos en `reportTitles` (`"Ejecución presupuestaria"`, `"Ejecución por proyecto"`).
   - Implementar `buildBudgetExecutionReport(...)` y `buildProjectExecutionReport(...)` y
     enrutarlas en `buildReportData(...)`.
   - Columnas: concepto / partida, presupuestado, ejecutado, variación. Incluir fila de totales,
     igual que el resumen de pantalla en `ReportsPage.jsx:816`-`818`.
   - Aplicar `fetchAllPages(...)` desde el inicio; no repetir el problema del cambio 1.
2. `src/pages/ReportsPage.jsx:547`: eliminar la exclusión de `canExportCurrentReport`.
3. Validar que `budget_execution` exija `budgetId` y `project_execution` exija `projectId`, tal
   como ya lo hace la pantalla (`ReportsPage.jsx:268` y `:280`-`282`).

### Criterio de aceptación
- La regla de `AGENTS.md` se cumple: **pantalla y exportación devuelven las mismas cifras** para el
  mismo presupuesto, proyecto y rango de fechas.
- El archivo se guarda en el bucket `report-exports` y respeta
  `accounts.reportRetentionDays` como el resto de exportaciones.

---

## Cambio 3. Moneda en presupuestos

### Problema
`supabase/projects_and_budgets.sql:17`-`37` define `budgets` y `budget_lines` **sin `currencyId`**,
y `getBudgetExecutionReport` no filtra por moneda. Si la cuenta registra gastos en más de una
moneda, el ejecutado **suma importes de monedas distintas en un mismo número**, sin conversión.

Para el proyecto de Eleven Studio se mitigó por contrato (la propuesta fija Lempiras como moneda de
control y obliga a registrar convertido), pero la limitación sigue presente en el producto.

### Qué hacer
1. Migración SQL siguiendo `docs/sql-runbook.md`:
   - `alter table public.budgets add column "currencyId" bigint references public.currencies(id);`
   - Backfill con la moneda local de cada cuenta.
   - Evaluar si conviene volverla `not null` después del backfill.
2. Exponer el selector de moneda en `src/pages/BudgetFormPage.jsx` (junto a `periodType`,
   `periodStart`, `periodEnd`, `projectId`).
3. Filtrar por `currencyId` en `getBudgetExecutionReport` y `getProjectExecutionReport`, y replicar
   el filtro en la exportación del cambio 2.
4. Agregar el filtro de moneda a la configuración de ambos reportes en `ReportsPage.jsx:35`-`36`.

### Criterio de aceptación
- Un presupuesto en HNL no incorpora gastos registrados en USD.
- Presupuestos existentes siguen funcionando tras el backfill.

---

## Orden de ejecución recomendado
1. **Cambio 1** — antes del 16 de septiembre de 2026. Es el único que puede hacer que el servicio
   entregue cifras incorrectas al cliente.
2. **Cambio 2** — durante las primeras semanas del servicio. Mientras no esté, el reporte semanal
   se produce manualmente a partir de la pantalla; la propuesta quedó redactada para no depender de
   esta función.
3. **Cambio 3** — sólo si aparecen gastos en moneda distinta a la de control.

## Checklist de validación
- `npm run build`.
- Comparar pantalla vs. exportación para `budget_execution` y `project_execution` con el mismo
  presupuesto, proyecto, moneda y rango de fechas.
- Probar con una cuenta con más de `1000` filas en `transactionDetails`.
- Verificar cambio de cuenta activa: los presupuestos, proyectos y filtros deben refrescarse.
- Verificar que un perfil sin permiso de reporte no vea las nuevas exportaciones
  (`ProfilesPage.jsx:89`-`90`).
- Revisar `docs/release-checklist.md` antes de desplegar.

## Fuera de alcance de este handoff
Se evaluaron y se **descartaron** para el servicio contratado. No implementar como parte de estos
cambios:

- Alertas automáticas por sobrecostes (umbrales, notificaciones).
- Proyecciones de gasto al cierre (forecast, ETC/EAC).
- Adjuntos de facturas y documentos de respaldo.
- Flujo de aprobación o estado "pendiente de validación" en gastos.
- Versionado de la línea base del presupuesto.

Nota sobre versionado: `updateBudgetWithLines` (`src/services/budgetsService.js:60`) **borra y
reinserta** todas las líneas, por lo que no queda historial del presupuesto original. Para este
proyecto se resolvió resguardando una copia de la línea base fuera del sistema. Si más adelante se
quiere control de versiones de presupuesto, esa función es el punto de partida.

## Comportamientos conocidos que conviene no "corregir" por error
- `getBudgetExecutionReport` sólo considera conceptos **que ya tienen línea presupuestaria**
  (`budgetsService.js:103`). Un gasto en un concepto no presupuestado no aparece ahí.
  `getProjectExecutionReport` sí une ambos conjuntos (`allConceptIds`, `budgetsService.js:180`).
  Es la razón operativa por la que el servicio usa **Ejecución por proyecto** como reporte primario.
- Los pagos aplicados insertan un `transactionDetail` con un **concepto de sistema de pagos**
  (`src/pages/TransactionPaymentPage.jsx:157`-`158`), distinto de los conceptos de gasto. Por eso
  **no hay doble conteo** en la ejecución presupuestaria. No cambiar ese concepto sin revisar estos
  reportes.
- Las transacciones de pago **no llevan `projectId`**. La ejecución presupuestaria se mide sobre el
  devengo (la compra o el gasto), no sobre el desembolso.
