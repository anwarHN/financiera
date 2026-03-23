# Glosario operativo y de contexto

## Términos de navegación
- `icons-menu`: columna lateral principal con módulos mayores.
- `app-menu`: menú secundario del módulo seleccionado.
- `actions-menu`: menú o bloque de acciones rápidas del módulo.
- `workspace`: área donde se muestra la pantalla activa.
- `topbar`: barra superior global.
- `related-account-banner`: aviso de cuenta relacionada activa.

## Términos de negocio
- `Factura`: venta.
- `Compra de mercadería`: compra que afecta inventario.
- `CxC`: cuenta por cobrar.
- `CxP`: cuenta por pagar.
- `Saldo anterior`: documento histórico cargado para arrastre de saldos previos.
- `Pendiente de entrega`: cantidad facturada menos cantidad entregada.
- `Inventario actual`: stock físico/operativo actual.
- `Inventario disponible`: inventario actual menos pendiente comprometido.
- `Kardex`: historial de movimientos de inventario por producto.
- `Obligación interna`: cuenta por pagar interna asociada a una forma de pago.

## Términos técnicos
- `accountId`: tenant o empresa activa.
- `currentProfile`: perfil efectivo del usuario en una cuenta.
- `reportAccess`: mapa de acceso a reportes por perfil.
- `isSystemAdmin`: usuario con permisos amplios.
- `isActive`: baja lógica, no borrado físico.
- `sourceTransactionId`: referencia al documento origen en grupos enlazados.
- `transactionPaidId`: enlace entre pago y documento pagado, o devolución y línea origen.
- `deliveryBatchKey`: identificador lógico de un lote de entrega.

## Tags relevantes
- `__prior_balance__`: saldo anterior.
- `__inventory_adjustment__`: ajuste de inventario.
- `__sale_return__`: devolución de venta.
- `__manual_receivable__`: CxC manual.
- `__manual_payable__`: CxP manual.

## Formas de pago vs métodos de pago
- `payment_methods`: método lógico, por ejemplo efectivo, tarjeta, transferencia.
- `account_payment_forms`: entidad concreta, por ejemplo una caja específica o una cuenta bancaria específica.

## Flujos especiales
- `incoming payment`: pago entrante que reduce CxC.
- `outgoing payment`: pago saliente que reduce CxP.
- `bank deposit`: grupo de transacciones que saca de caja y mete a banco.
- `bank transfer`: grupo de transacciones que mueve entre bancos.
- `cash withdrawal`: grupo de transacciones que saca de banco y lleva a caja.

## Exportación
Cuando se habla de `exportación`, normalmente se refiere a:
- `src/services/reportsService.js` en frontend
- `supabase/functions/export-report/index.ts` en backend

## Cambio de cuenta
Cuando se habla de `cambiar de cuenta` se refiere a:
- cambiar la `account` activa en `AuthContext`
- refrescar permisos, moneda local, perfil y estado dependiente de tenant
