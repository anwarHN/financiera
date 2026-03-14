# Reglas del negocio

## Multiempresa
- Cada dato operativo pertenece a una cuenta (`accountId`).
- Un usuario puede pertenecer a varias cuentas.
- La interfaz debe reflejar claramente la cuenta activa.

## Ventas y compras
- Facturas pueden ser de contado o crédito.
- Compras de mercadería pueden ser de contado o crédito.
- Facturas y compras de saldo anterior son documentos históricos y pueden requerir fecha anterior a hoy.

## Cuentas por cobrar / pagar
- Las CxC/CxP representan compromisos, no flujo de efectivo inicial.
- Deben aparecer en sus reportes al corte por fecha `hasta`.
- Deben aceptar pagos parciales y anulación de pagos aplicados.
- También existen CxC/CxP manuales sin productos.

## Flujo de caja
- Sólo debe reflejar entradas y salidas reales de efectivo/banco/caja.
- No debe considerar el registro inicial de CxC/CxP como flujo.
- Sí debe considerar:
  - pagos entrantes
  - pagos salientes
  - retiros de efectivo
  - depósitos bancarios

## Inventario
- Sólo productos de tipo `Producto` llevan inventario.
- Servicios no llevan inventario.
- Inventario actual:
  - compras activas de mercadería
  - menos cantidades entregadas
- Pendiente de entrega:
  - cantidad facturada
  - menos cantidad entregada
- Inventario disponible:
  - inventario actual
  - menos pendiente de entrega

## Entrega de mercadería
- Una factura puede registrar cantidad facturada y cantidad entregada por separado.
- Si no se entrega todo al facturar, queda pendiente.
- Las entregas posteriores deben quedar en historial.

## Ajustes y devoluciones
- Ajuste de inventario permite valores positivos o negativos.
- Devoluciones sobre facturas devuelven inventario y se registran como transacción propia.

## Pagos
- La validación de pagos debe considerar sólo pagos activos.
- La comparación contra saldo pendiente debe redondear a 2 decimales.

## Perfiles y permisos
- Un usuario sin permiso no debe ver menú, acción ni ruta.
- El acceso a reportes se define por perfil.
