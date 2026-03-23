# Visión general

## Qué hace el proyecto
`Daime` es una aplicación web financiera multiempresa construida en React + Vite + Supabase.
Permite operar una empresa por `accountId` con módulos de:
- dashboard
- clientes y proveedores
- empleados, disponibilidad y ausencias
- ventas y compras
- cuentas por cobrar y cuentas por pagar
- inventario, ajustes y entregas de mercadería
- cajas, bancos, tarjetas y conciliación bancaria
- préstamos a empleados y obligaciones internas
- proyectos y presupuestos
- reportes y exportación a Excel
- perfiles, permisos y usuarios
- billing, invitaciones y cuentas compartidas

## Stack
- Frontend: React 18 + React Router
- Build: Vite
- Backend: Supabase
- Base de datos: PostgreSQL en Supabase
- Autenticación: Supabase Auth
- Exportaciones: Edge Function `supabase/functions/export-report/index.ts`

## Configuración mínima del frontend
Archivo: `src/lib/supabase.js`
Variables requeridas:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Si faltan, la app falla al iniciar.

## Configuración de funciones en Supabase
Archivo: `supabase/config.toml`
Funciones declaradas con `verify_jwt = false`:
- `send-invitation`
- `list-account-users`
- `export-report`
- `create-billing-checkout`
- `create-billing-portal`
- `stripe-webhook`
- `sync-billing-seats`
- `list-billing-payment-methods`
- `create-billing-setup-session`
- `set-default-billing-payment-method`
- `deactivate-account-user`
- `accept-shared-invitation`
- `list-pending-invitations`

Aunque `verify_jwt` esté desactivado en config, varias funciones validan autorización manualmente en código.

## Arquitectura general
- `src/App.jsx` define las rutas.
- `src/components/Layout.jsx` arma el shell principal de la aplicación autenticada.
- `src/contexts/AuthContext.jsx` controla sesión, cuenta activa, perfil y permisos.
- `src/contexts/I18nContext.jsx` controla idioma y traducciones.
- `src/services/*.js` concentra acceso a datos y reglas operativas del frontend.
- `supabase/*.sql` contiene migraciones y reglas SQL.
- `supabase/functions/*` contiene Edge Functions.

## Cómo fluye una operación típica
1. El usuario inicia sesión.
2. `AuthContext` resuelve sesión, cuentas accesibles, cuenta activa y perfil actual.
3. `Layout` muestra `icons-menu`, `app-menu` y `actions-menu` según permisos y ruta.
4. La pantalla llama servicios (`src/services/*`) para cargar datos de la cuenta activa.
5. Las escrituras van a Supabase usando el cliente JS.
6. Reportes complejos o exportaciones también se reflejan en `supabase/functions/export-report/index.ts`.

## Términos de UI
### `icons-menu`
Columna lateral más externa con los módulos principales del sistema. Cada ítem representa un grupo funcional. Ejemplos:
- General
- Ventas
- Cuentas por cobrar
- Inventario
- Reportes

### `app-menu`
Menú secundario que cambia según el módulo seleccionado en `icons-menu`. Muestra las opciones internas del módulo actual.
Ejemplo en Inventario:
- Compras
- Ajustes de inventario
- Entrega de mercadería

### `actions-menu`
Barra/menú de acciones rápidas del módulo actual. Suele contener:
- crear
- refrescar
- acciones contextuales del módulo

### `workspace`
Área principal donde se muestra la pantalla activa: listado, formulario, detalle o reporte.

### `topbar`
Barra superior global con cambio de tema, búsqueda, cambio de cuenta, notificaciones y menú de usuario.

### `related-account-banner`
Franja visible cuando la cuenta activa no es la cuenta principal del usuario.

### `account notice modal`
Modal de bienvenida al login real o modal de confirmación al cambiar de cuenta.

## Reglas importantes del sistema
- Todo dato operativo debe quedar asociado a `accountId`.
- Pantalla y exportación deben permanecer alineadas cuando se toca un reporte.
- Cambio de cuenta debe forzar recarga de picklists, lookups y estado local.
- Menús, acciones y rutas deben respetar permisos de perfil.
- `CxC` y `CxP` no son flujo de caja al crearse; los pagos sí.
- Inventario depende de compras, ajustes y entregas.

## Archivos que siempre conviene leer antes de tocar algo grande
- `docs/index.md`
- `AGENTS.md`
- `handoff.md`
- `docs/decisions.md`
- `docs/domain-rules.md`
- `docs/transactions-and-reports.md`
- `docs/pending.md`
- `docs/frontend-map.md`
- `docs/services-map.md`
- `docs/supabase-map.md`
