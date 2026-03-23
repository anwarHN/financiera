# AGENTS.md

## Objetivo
Aplicación web financiera multiempresa construida en React + Vite + Supabase. El sistema maneja ventas, compras, inventario, entregas, cuentas por cobrar/pagar, bancos, cajas, reportes, billing, perfiles con permisos y cuentas compartidas.

## Qué leer primero al retomar el proyecto
1. `docs/index.md`
2. `handoff.md`
3. `docs/overview.md`
4. `docs/frontend-map.md`
5. `docs/services-map.md`
6. `docs/supabase-map.md`
7. `docs/glossary.md`
8. `docs/transactions-and-reports.md`
9. `docs/sql-runbook.md`
10. `docs/release-checklist.md`
11. `docs/decisions.md`
12. `docs/domain-rules.md`
13. `docs/pending.md`

## Reglas de trabajo
- Mantener consistencia entre frontend y exportación/reportes de Supabase.
- Cuando una lógica exista en pantalla y en `supabase/functions/export-report/index.ts`, actualizar ambas.
- Cuando una lógica dependa de datos multiempresa, validar siempre `accountId`.
- Al cambiar de cuenta, cualquier pantalla o formulario debe refrescar datos dependientes de cuenta.
- No introducir cambios destructivos en SQL o git sin solicitud explícita.
- No revertir cambios del usuario fuera del alcance de la tarea.
- Preferir cambios pequeños, localizados y verificables.
- Validar con `npm run build` después de cambios relevantes en frontend.
- Usar `apply_patch` para ediciones puntuales.

## Reglas de UI
- Reutilizar componentes existentes antes de crear variantes nuevas.
- Para solo lectura usar `src/components/form/ReadOnlyField.jsx`.
- Para toggles usar `src/components/ToggleSwitch.jsx`.
- Mantener modales de crear/editar consistentes entre módulos.
- Mantener el `icons-menu`, `app-menu` y `actions-menu` consistentes con permisos.

## Reglas de permisos
- No mostrar entradas de menú, acciones ni rutas a usuarios sin permiso.
- Respetar `hasModulePermission`, `hasReportPermission`, `canCreateUsers`, `canCreateProfiles`, `canVoidTransactions`.
- La pantalla de reportes debe filtrar reportes visibles por acceso configurado en perfil.

## Reglas de datos
- Cuentas por cobrar/pagar no representan flujo de efectivo al momento de registrarse.
- Los pagos sí afectan flujo de caja.
- Inventario y entregas requieren revisar historial, cantidades facturadas y cantidades entregadas por separado.
- No asumir que `balance` persistido es suficiente si el caso requiere recalcular contra pagos activos.

## Archivos críticos
- `src/components/Layout.jsx`
- `src/contexts/AuthContext.jsx`
- `src/pages/TransactionCreatePage.jsx`
- `src/pages/TransactionsPage.jsx`
- `src/pages/ReportsPage.jsx`
- `src/services/transactionsService.js`
- `src/services/reportsService.js`
- `supabase/functions/export-report/index.ts`
- `supabase/payment_forms_and_ap.sql`
- `supabase/auth_signup_trigger.sql`
- `supabase/rls.sql`

## Validaciones mínimas antes de cerrar una tarea
- `npm run build`
- Revisar que pantalla y exportación sigan alineadas si se tocó reportes.
- Revisar que cambio de cuenta no deje estado viejo si se tocaron formularios o pantallas con picklists.
