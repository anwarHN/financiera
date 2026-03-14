# Decisiones

## Arquitectura
- Frontend en React + Vite.
- Backend y persistencia en Supabase.
- Exportación de reportes en `supabase/functions/export-report/index.ts`.
- Multiempresa por `accountId`.

## Branding y UI
- Nombre de la aplicación: `Daime`.
- Color primario: Azul Institucional.
- El isotipo se usa como marca de agua en el `icons-menu`.
- Login y registro usan layout dividido con panel visual a la izquierda.

## Cuenta activa
- Se eliminó la lógica de forzar cuenta principal al iniciar sesión.
- La cuenta activa se conserva según selección del usuario.
- Existe modal de bienvenida al login real y modal al cambiar de cuenta.
- Existe alerta superior cuando se trabaja en una cuenta relacionada.
- El contenido principal se remonta al cambiar `accountId` para refrescar estado local y picklists.

## Reportes
- `Cuentas por cobrar` y `Cuentas por pagar` trabajan con fecha `hasta`, no con rango completo.
- `Flujo de caja` excluye CxC/CxP como compromisos, pero sí incluye pagos.
- `Flujo de caja` y exportación deben mantenerse alineados.
- Los depósitos bancarios afectan saldos por cuenta, pero no son ingreso/gasto operativo.
- `Pendientes de entrega` se agrupa por cliente y producto, con subtotales.

## Inventario
- Productos y servicios se distinguen; sólo producto maneja inventario.
- Inventario usa cantidad facturada y cantidad entregada por separado.
- Existe historial de entregas en `inventory_delivery_history`.
- Ajustes de inventario y compras de mercadería afectan inventario.

## Transacciones especiales
- Facturas y compras de saldo anterior existen como flujos separados.
- Cuentas por cobrar/pagar manuales se crean sin productos y con comentarios.
- Depósitos bancarios, traslados bancarios y retiros de efectivo se guardan como grupos de transacciones enlazadas.

## Permisos
- El menú y las rutas directas se filtran por permisos de perfil.
- Reportes visibles dependen de `reportAccess`.
