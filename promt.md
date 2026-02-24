# Prompt base para replicar el proyecto (solo CORE)

Usa este prompt como instruccion maestra para generar un nuevo proyecto web tipo SaaS multi-tenant con Supabase. No incluyas modulos de negocio (clientes, transacciones, citas, productos, cuentas/tarjetas, planeacion, catalogos). Solo construye el core.

## Rol
Actua como arquitecto + implementador senior de React + Supabase. Entrega codigo listo para ejecutar, con estructura limpia, seguridad por tenant (RLS), y UX consistente.

## Objetivo funcional (scope)
Construir una aplicacion base con:
1. Registro e inicio de sesion.
2. Alta automatica de cuenta (account) al registrarse.
3. Relacion usuario-cuenta (multi-account por usuario).
4. Gestion de cuenta (usuarios, perfiles/permisos, invitaciones, ajustes).
5. Layout principal para modulos normales.
6. Layout separado para modo gestion de cuenta (sin icon-menu lateral de modulos).
7. Dashboard basico (solo shell/core).
8. Notificaciones en topbar (stub o datos simples).
9. Soporte de idioma ES/EN.
10. Tema light/dark.
11. Preferencias de UI: tamano de texto y densidad (compact/comfortable).
12. Permisos por modulo/accion y validacion visual de botones (crear/editar/anular).

## No incluir
- Clientes / proveedores.
- Productos.
- Transacciones, conciliacion, CxP/CxC.
- Citas.
- Planeacion (proyectos/presupuestos).
- Catalogos funcionales de negocio.

## Stack y estandares
- Frontend: React + Vite + React Router.
- Estado global: Context API para auth e i18n.
- Backend: Supabase (Auth + Postgres + RLS + Edge Functions opcionales).
- Estilos: CSS global con variables (custom properties).
- Convenciones:
  - Soft delete (`isActive`) en entidades administrativas.
  - Formularios en modal para crear/editar donde aplique.
  - Tablas con acciones por fila (menu de acciones).

---

## Arquitectura de carpetas (esqueleto)
Genera este esqueleto minimo:

```txt
src/
  App.jsx
  main.jsx
  lib/
    supabase.js
  contexts/
    AuthContext.jsx
    I18nContext.jsx
  components/
    Layout.jsx
    AccountLayout.jsx
    ProtectedRoute.jsx
    RowActionsMenu.jsx
    Pagination.jsx
    StatusBadge.jsx
    Modal.jsx
  pages/
    LoginPage.jsx
    RegisterPage.jsx
    DashboardPage.jsx
    AccountManagePage.jsx
    AccountUsersPage.jsx
    ProfilesPage.jsx
    AccountInvitationsPage.jsx
    AccountSettingsPage.jsx
  services/
    authService.js
    accountService.js
    profilesService.js
    invitationsService.js
  i18n/
    translations.js
  styles/
    global.css
supabase/
  rls.sql
  admin_profiles.sql
  auth_signup_trigger.sql
  profiles_permissions_modules.sql
README.md
```

---

## Ruteo y layouts
Configura rutas privadas con `ProtectedRoute` y 2 layouts:

1. `Layout.jsx` (modo normal)
- Topbar: buscador global, home, cambio de cuenta, notificaciones, menu usuario.
- Sidebar/icon-menu para modulos core.
- App-menu sticky para acciones del modulo.
- Workspace principal.

2. `AccountLayout.jsx` (modo gestion de cuenta)
- Sin icon-menu lateral de modulos.
- Area full width.
- App-menu horizontal con scroll en responsive (no colapsar a "Mas").
- Mismas capacidades de topbar (tema, idioma, preferencias UI, usuario, notificaciones).

Rutas sugeridas:
- Publicas: `/login`, `/register`.
- Privadas:
  - `/` dashboard.
  - `/account` redirect a `/account/users`.
  - `/account/users`
  - `/account/profiles`
  - `/account/invitations`
  - `/account/settings`

---

## UX/UI base obligatoria
1. Tema light/dark via `data-theme`.
2. Tamano texto: `sm | md | lg` via `data-text-size`.
3. Densidad: `compact | comfortable` via `data-density`.
4. Persistir preferencias en `localStorage`.
5. Tablas:
- header con fondo y bordes redondeados.
- hover en `tr`.
- columna numerica a la derecha.
- columna acciones centrada.
6. Formularios:
- indicar requeridos con `*`.
- borde rojo si falta requerido al guardar.
- boton primario estilo comun (`action-btn main`).
- boton cancelar alineado a la derecha.
7. Modales:
- no cerrar al click fuera.
- footer estandar: primario a la izquierda, cancelar a la derecha.

---

## Modelo de datos CORE (Supabase)
Define tablas minimas:

1. `accounts`
- `id bigserial pk`
- `created_at timestamptz default now()`
- `name varchar not null`
- `email varchar`
- `createdById uuid references auth.users(id)`
- `isActive boolean default true`

2. `usersToAccounts`
- `id bigserial pk`
- `created_at timestamptz default now()`
- `userId uuid references auth.users(id)`
- `accountId bigint references accounts(id)`
- unique(`userId`,`accountId`)

3. `currencies` (solo para soporte base de cuenta)
- `id bigserial pk`
- `created_at timestamptz default now()`
- `accountId bigint references accounts(id)`
- `name varchar not null`
- `symbol varchar not null`
- `isLocal boolean default false`
- `isActive boolean default true`

4. `account_profiles`
- `id bigserial pk`
- `accountId bigint references accounts(id)`
- `name varchar not null`
- `isSystemAdmin boolean default false`
- `canCreateUsers boolean default false`
- `canCreateProfiles boolean default false`
- `canVoidTransactions boolean default false`
- `permissions jsonb not null default '{}'::jsonb`
- `createdById uuid references auth.users(id)`

5. `users_to_profiles`
- `id bigserial pk`
- `accountId bigint references accounts(id)`
- `userId uuid references auth.users(id)`
- `profileId bigint references account_profiles(id)`
- unique(`accountId`,`userId`)

6. `account_user_invitations`
- `id bigserial pk`
- `accountId bigint references accounts(id)`
- `email varchar not null`
- `profileId bigint references account_profiles(id)`
- `status varchar default 'pending'`
- `sentAt timestamptz`
- `expiresAt timestamptz default now() + interval '7 days'`
- `invalidatedAt timestamptz`
- `createdById uuid references auth.users(id)`
- check status in `('pending','sent','linked','expired','invalidated')`

---

## Trigger de signup (obligatorio)
Al crear un usuario en `auth.users`:
1. Crear `accounts` usando `company_name` de metadata (fallback "Empresa").
2. Crear relacion en `usersToAccounts`.
3. Crear moneda local por pais (`country_code`).
4. Crear perfil admin por defecto con permisos full.
5. Asignar el admin al usuario en `users_to_profiles`.
6. Si llega `invitation_id` valida invitacion pendiente y enlaza usuario a cuenta existente en vez de crear cuenta nueva.

Incluye el trigger en `supabase/auth_signup_trigger.sql`.

---

## RLS y seguridad multi-tenant (obligatorio)
Implementar en `supabase/rls.sql`:

1. `enable row level security` para tablas core.
2. Funcion helper:

```sql
create or replace function public.user_belongs_to_account(target_account_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."usersToAccounts" uta
    where uta."userId" = auth.uid()
      and uta."accountId" = target_account_id
  );
$$;
```

3. Politicas:
- `accounts`: select/update solo si pertenece a cuenta.
- `usersToAccounts`: select para propio usuario o miembros de la cuenta.
- `account_profiles`, `users_to_profiles`, `account_user_invitations`, `currencies`: `for all` con `user_belongs_to_account(accountId)` en `using` y `with check`.

4. Funcion admin opcional para actualizar configuraciones sensibles:

```sql
create or replace function public.user_is_account_admin(target_account_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users_to_profiles up
    join public.account_profiles ap on ap.id = up."profileId"
    where up."accountId" = target_account_id
      and up."userId" = auth.uid()
      and ap."isSystemAdmin" = true
  );
$$;
```

---

## Permisos y perfiles (frontend + backend)
Permisos JSON base sugeridos:

```json
{
  "dashboard": {"read": true, "create": false, "update": false},
  "users": {"read": true, "create": false, "update": false},
  "profiles": {"read": true, "create": false, "update": false},
  "account": {"read": true, "create": false, "update": true},
  "notifications": {"read": true, "create": false, "update": false}
}
```

En `AuthContext` exponer:
- `isSystemAdmin`
- `hasModulePermission(moduleKey, action='read')`
- `canCreateUsers`
- `canCreateProfiles`
- `hasDashboardAccess()`

Aplicar en UI:
- Si no tiene permiso, ocultar botones Crear/Editar/Anular.
- Si no tiene permiso de lectura, redirigir o mostrar pantalla "sin acceso".

---

## Gestion de cuenta
Construir modulo `/account/*` con:

1. Usuarios
- listado de usuarios ligados a cuenta.
- opcion de invitar por email.
- opcion de desactivar acceso de usuario a cuenta (soft).

2. Perfiles
- CRUD de perfiles.
- matriz de permisos (read/create/update).
- opcion "seleccionar todo" por columna.

3. Invitaciones
- listado de invitaciones y estados.
- reenviar/invalidar (segun estado).

4. Ajustes
- nombre de cuenta.
- datos basicos de cuenta.

---

## Topbar y experiencia global
Implementar en `Layout` y `AccountLayout`:
1. Busqueda global (minimo 2 caracteres).
2. Cambio de cuenta activo.
3. Centro de notificaciones (puede ser mock inicial).
4. Menu usuario:
- idioma
- tema
- tamano de texto
- densidad
- cerrar sesion

Persistencia local:
- `activeAccountId`
- `theme`
- `textSize`
- `density`
- `language`

---

## i18n
Crear `translations.js` con namespaces:
- `common`
- `topbar`
- `sidebar`
- `nav`
- `auth`
- `profiles`
- `account`

Idiomas:
- `es`
- `en`

Regla:
- si falta key, retornar la key (`t('x.y') => 'x.y'`).

---

## Criterios de aceptacion
1. Usuario puede registrarse y crear cuenta automaticamente.
2. Usuario puede iniciar sesion y ver dashboard.
3. Puede cambiar entre cuentas a las que pertenece.
4. RLS bloquea acceso a datos de otras cuentas.
5. Puede gestionar perfiles y permisos dentro de su cuenta.
6. Layout normal y AccountLayout funcionan por separado.
7. Tema/idioma/tamano/densidad persisten al recargar.
8. Responsive usable en movil (topbar, app-menu horizontal, tablas con scroll).

---

## Entregables esperados
1. Codigo funcional frontend + servicios.
2. SQL listo para ejecutar:
- `supabase/admin_profiles.sql`
- `supabase/rls.sql`
- `supabase/auth_signup_trigger.sql`
- `supabase/profiles_permissions_modules.sql`
3. README con orden de ejecucion de SQL.
4. Datos mock minimos para probar UI (opcional).

---

## Orden sugerido de implementacion
1. Inicializar proyecto Vite + Supabase client.
2. AuthContext + I18nContext.
3. Rutas publicas/privadas.
4. Layout principal + AccountLayout.
5. SQL core (accounts, usersToAccounts, perfiles, invitaciones).
6. Trigger signup.
7. RLS completo.
8. Pantallas de gestion de cuenta.
9. Permisos en frontend.
10. Pulido visual + responsive + README.

