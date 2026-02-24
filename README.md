# Financiera Web

Base inicial del app web en React para el proyecto Financiera, usando Supabase como backend.

## Requisitos

- Node.js 20+
- Proyecto de Supabase configurado

## Variables de entorno

1. Copia `.env.example` a `.env`.
2. Completa:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Instalar y ejecutar

```bash
npm install
npm run dev
```

## Qué incluye esta base

- Login y registro con Supabase Auth.
- Registro de empresa al crear cuenta (tabla `accounts`) y relación usuario-cuenta (`usersToAccounts`) vía trigger SQL.
- Layout protegido con rutas privadas.
- i18n básico con labels (`es`/`en`) en frontend.
- Pantallas iniciales para dashboard, clientes/proveedores y empleados.
- CRUD inicial en web para:
  - `persons` (clientes/proveedores)
  - `employes` (empleados/socios)
  - `concepts` (conceptos/productos/formas de pago)
  - `transactions` + `transactionDetails` para:
    - ventas (`type = 1`)
    - gastos (`type = 2`)
    - ingresos (`type = 3`)
    - no se editan ni eliminan físicamente; solo se desactivan (`isActive = false`)
- SQL inicial de RLS para aislamiento multiempresa en `supabase/rls.sql`.
- SQL trigger de registro en `supabase/auth_signup_trigger.sql`.
- SQL de perfiles/administración en `supabase/admin_profiles.sql`.
- Edge Function de invitaciones por correo en `supabase/functions/send-invitation/index.ts`.
- Edge Function de exportación de reportes a XLSX en `supabase/functions/export-report/index.ts`.
- Base de membresía Stripe (trial 5 días y cobro por usuario) en `supabase/membership_stripe.sql`.
- SQL para métodos de pago, cuentas/tarjetas y módulos de CxP/CxC en `supabase/payment_forms_and_ap.sql`.

## Importante para registro sin error

Ejecuta también en Supabase:

```sql
-- archivo: supabase/auth_signup_trigger.sql
```

Con esto, al registrarse un usuario se crea automáticamente:
- `accounts`
- `usersToAccounts`
- `currencies` (moneda local según país)
- perfil `Administrador` (si existen tablas de perfiles)
- métodos de pago por cuenta + conceptos de sistema de pagos (si existe esquema de `payment_forms_and_ap.sql`)

El frontend envía `company_name` en el metadata del signup.

Orden recomendado de SQL:
1. `supabase/admin_profiles.sql`
2. `supabase/payment_forms_and_ap.sql`
3. `supabase/auth_signup_trigger.sql`

## Invitaciones por correo

Para enviar invitaciones por correo usando Supabase:

1. Crear tablas/perfiles:
   - Ejecuta `supabase/admin_profiles.sql`.
2. Desplegar la función:
   - `supabase functions deploy send-invitation`
3. Configurar secret:
   - `SUPABASE_SERVICE_ROLE_KEY` para la función.
4. La invitación llega con link:
   - `/accept-invitation/:id?email=...`
5. El registro desde invitación envía `invitation_id` en metadata.

## Exportación de reportes (XLSX) y limpieza periódica

1. Ejecuta SQL de infraestructura:
   - `supabase/report_exports.sql`
2. Despliega la función:
   - `supabase functions deploy export-report`
3. Configura secret para funciones (si no existe):
   - `SERVICE_ROLE_KEY`
4. El sistema guarda los archivos en bucket privado:
   - `report-exports`
5. Se crea limpieza diaria automática (`pg_cron`) y la retención se configura por cuenta con:
   - `accounts.reportRetentionDays`

## Membresía y pagos (PayPal / Stripe)

### PayPal (flujo actual en este repositorio)

1. Ejecuta SQL:
   - `supabase/membership_stripe.sql`
   - `supabase/membership_paypal.sql`
2. Crea en PayPal un plan mensual por usuario y guarda su `plan_id`.
3. Configura secrets de funciones:
   - `SERVICE_ROLE_KEY`
   - `PAYPAL_ENV` (`sandbox` o `live`)
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_PLAN_ID_MONTHLY` (o `PAYPAL_PLAN_ID`)
   - `PAYPAL_WEBHOOK_ID`
   - `PAYPAL_MANAGE_SUBSCRIPTION_URL_TEMPLATE` (opcional)
4. Despliega funciones:
   - `supabase functions deploy create-billing-checkout`
   - `supabase functions deploy create-billing-portal`
   - `supabase functions deploy sync-billing-seats`
   - `supabase functions deploy deactivate-account-user`
   - `supabase functions deploy list-billing-payment-methods`
   - `supabase functions deploy create-billing-setup-session`
   - `supabase functions deploy set-default-billing-payment-method`
   - `supabase functions deploy stripe-webhook`
5. Configura webhook en PayPal apuntando a:
   - `https://<project-ref>.functions.supabase.co/stripe-webhook`
   - Nota: el endpoint se llama `stripe-webhook` por compatibilidad histórica, pero procesa eventos de PayPal.
6. Eventos recomendados en PayPal webhook:
   - `BILLING.SUBSCRIPTION.CREATED`
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.UPDATED`
   - `BILLING.SUBSCRIPTION.SUSPENDED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `BILLING.SUBSCRIPTION.EXPIRED`
   - `PAYMENT.SALE.DENIED`

### Stripe (referencia)

Si deseas operar con Stripe, deja configurado el SQL base y las claves de Stripe:

1. Ejecuta SQL:
   - `supabase/membership_stripe.sql`
2. Configura secrets:
   - `SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_ID_MONTHLY`
   - `STRIPE_BILLING_CURRENCY` (opcional, default `usd`)
   - `STRIPE_WEBHOOK_SECRET`
3. Si vas a usar webhook de Stripe, registra los eventos:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. URL webhook:
   - `https://<project-ref>.functions.supabase.co/stripe-webhook`
5. Importante:
   - En el estado actual del código, el flujo de checkout/portal/webhook está implementado para PayPal.
   - Si habilitas Stripe end-to-end, ajusta o crea handlers específicos para Stripe antes de pasar a producción.

## Siguiente fase recomendada

1. Crear catálogo de conceptos/productos con CRUD real.
2. Construir módulo de ventas con `transactions` + `transactionDetails`.
3. Implementar perfiles/permisos por módulo (incluyendo permiso para visualizar salarios).
4. Agregar dashboards y reportes con Chart.js.
5. Crear capa API (Edge Functions de Supabase) para lógica sensible de negocio.
