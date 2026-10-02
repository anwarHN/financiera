# Facturas PDF e integracion Imprent

## Uso

- Cuenta > Integraciones (`/account/integrations`): solo el propietario puede activar o desactivar Imprent, subir/descargar DOCX y seleccionar la plantilla por defecto.
- El boton Activar Imprent permanece visible aunque falle la consulta inicial. Durante la carga esta deshabilitado; ante un error se permite reintentar o activar, mostrando el fallo sin asumir que la integracion esta inactiva. Esto no sustituye el despliegue de la funcion y migraciones requeridas.
- Activar Imprent registra automaticamente la empresa usando el correo del propietario autenticado, habilita B2B_FREE y vincula la plantilla `defaultTemplates.invoice`. No realiza llamadas externas desde el trigger de signup: la activacion inicial se solicita en esta pantalla.
- El propietario confirma la advertencia de rotacion: Imprent identifica cuentas por correo y puede reemitir una clave si ese correo ya se usa en otro sistema. Dentro de Financiera se impide vincular el mismo correo o cuenta Imprent a empresas diferentes.
- Si falla billing, se conserva la credencial pero la integracion queda inactiva con el error visible. Reintentar utiliza esa credencial, sin registrar otra vez. La activacion concurrente queda bloqueada durante cinco minutos como maximo.
- Una vez activo, el boton Imprimir factura en el detalle de venta abre el modal y genera de inmediato el PDF con la plantilla predeterminada. Cambiar la plantilla regenera el archivo automaticamente; luego se puede descargar o abrir para imprimir con el visor del navegador. Requiere permiso `sales.read`; el servidor lo verifica aparte de la membresia.
- No se promete impresion silenciosa: el usuario utiliza el visor PDF de su navegador. El servicio TXT para 127.0.0.1:18080 se conserva en el codigo por compatibilidad, pero ya no aparece como una accion separada en el detalle de la factura.
- Se rechazan PDFs de facturas anuladas para evitar que una plantilla personalizada las presente como validas. Las facturas de saldo anterior pueden imprimirse, pero no consumen numeracion.
- La pestaña y la tabla `account_integrations` dejan un punto de extension para otros proveedores; cada proveedor futuro requiere su adaptador y permisos server-side, no solo una nueva fila.

## Credenciales y transporte

`account_integrations` tiene una fila por cuenta/proveedor. Las credenciales no tienen permisos SELECT/INSERT/UPDATE para `anon` ni `authenticated`; solamente el servidor con service role accede a ellas. Se almacenan en la base, no en un secreto VITE ni en localStorage. No se implementa cifrado de campo adicional en esta version: restringir tambien acceso a respaldos y administradores de la base.

`imprent-integration` retorna un estado publico explicito, nunca `credentials`. `invoice_pdf_templates` tambien se administra a traves de la funcion, con transaccion SQL para cambiar el default. La desactivacion de plantilla es local: no elimina el DOCX en Imprent. La plantilla actual por defecto no puede desactivarse sin elegir una sustituta.

Todas las llamadas al proveedor usan `IMPRENT_BASE_URL` del servidor, timeout y redirects bloqueados. HTTPS es obligatorio por defecto. Mientras el servidor Imprent no tenga TLS, se puede habilitar HTTP explicitamente con el secreto `IMPRENT_ALLOW_INSECURE_HTTP=true`; esto envia la API key y los datos de las facturas sin cifrado de transporte, por lo que debe limitarse a una red confiable y retirarse al habilitar HTTPS. La descarga se construye con `finalFile`, ignorando URLs arbitrarias devueltas por el proveedor. El PDF se valida por firma `%PDF-` y se retorna como binario; la API key no llega al navegador. Errores del proveedor/base no se reflejan literalmente para evitar exponer secretos.

Las funciones tienen `verify_jwt=false` como las demas del proyecto, pero validan explicitamente el bearer mediante `auth.getUser`, la membresia y los permisos antes de leer credenciales o documentos. Referencia de autenticacion: [Supabase Edge Functions](https://supabase.com/docs/guides/functions/auth).

## Numeracion

Se conserva Catalogos > Numeracion de facturas (`/invoice-numbering`) y su bootstrap existente para cuentas nuevas. Patrones: `{0}`, `{number}`, `{0:00000000}` y `{number:00000000}`; no se truncan valores mas largos que el relleno. Los campos de rango, fecha limite y referencias conservan su configuracion actual.

Las facturas nuevas usan `create_numbered_invoice`: cabecera y detalles se insertan en la misma transaccion. El trigger selecciona el correlativo activo con rango disponible y fecha limite valida para la fecha del documento, bloquea la cuenta y la fila, incrementa el ultimo numero y guarda `number`, `printNumber`, `correlativeId` y `correlativeSnapshot`.

- Si falla cualquier linea, se revierte tambien el avance del contador.
- Reimprimir, editar o anular no consume numeros. No se permite modificar numeracion/asignacion ya emitida.
- Las referencias y el rango de una factura nueva provienen de la copia historica, no de la configuracion actual. Un correlativo que emitio facturas nuevas no admite cambios de formato/rango/referencias: desactivar y crear uno nuevo. Nunca se permite retroceder su contador.
- Se comprueba que el numero impreso no haya sido utilizado por otra factura ordinaria de la cuenta, incluso anulada.
- Se mantienen la prioridad por vencimiento y el fallback ilimitado existentes. No se copio la regla de una unica serie activa por sucursal de Unico: Financiera no maneja sucursales. Si se requiere bloquear al agotar un rango fiscal, desactivar el correlativo ilimitado anterior.
- Compras, CxC manual y facturas de saldo anterior no consumen correlativo. Estas ultimas conservan numero y numero de impresion manuales opcionales.
- No se renumeran facturas historicas ni se infiere un correlativo para ellas. Sus referencias/rangos PDF quedan vacios si no hay snapshot.
- La reserva RPC anterior se revoca para clientes: no volver a usar `reserve_transaction_correlative` desde frontend.

## Plantillas y campos

El contrato conserva `records`, `childs`, `blocks_to_delete` y `blocks_to_replace`. El adaptador esta en `supabase/functions/_shared/invoicePdfPayload.js` y es la fuente de campos soportados. Todos los valores de impresion son strings.

Cabecera: `${tenant_name}`, `${branch_address}`, `${customer_display_name}`, `${transaction_number_long}`, `${transaction_date_dmy}`, `${currency_name}`, `${currency_symbol}`, `${payment_type_label}`, `${observations}`, `${reference}`, `${correlative_reference_1}`, `${correlative_reference_2}`, `${correlative_valid_until}`, `${correlative_min_value}`, `${correlative_max_value}`.

Totales: `${subtotal}`, `${discount_total}`, `${tax_total}`, `${additional_charges}`, `${subtotal_exempt}`, `${subtotal_taxable}`, `${total}`, `${total_in_words}`. Se calculan subtotales/impuestos desde todas las lineas paginadas; la cabecera del sistema puede guardar `net=total`, por lo que no sirve para el desglose. El total general sigue siendo el importe persistido de la factura.

Detalle Word: usar `${lines_row}` en una fila de tabla, con `${lines_product_name}`, `${lines_quantity}`, `${lines_unit_price}`, `${lines_subtotal}`, `${lines_discount_amount}`, `${lines_tax_amount}`, `${lines_total}`. Hay bloques `tax_bases` y `tax_amounts`; las claves interiores son `tax_percent`, `tax_base_total` (tambien `tax_total_base`) y `total_tax`, sin prefijo. Se incluyen aliases legacy presentes en la plantilla invoiceUnicoERP del proveedor.

RTN: se captura en Cuenta > Configuracion para el emisor y en crear/editar Clientes o Proveedores, incluidos los modales. Se guarda como texto opcional de 14 digitos sin separadores; conserva ceros iniciales. Frontend y restricciones SQL validan el formato, no la existencia del contribuyente ante el SAR. Referencia de formato: [Registro Tributario Nacional](https://sde.gob.hn/registro-tributario-nacional-numerico-rtn/).

El PDF llena `${tenant_tax_id}` / `${documento_tributario_empresa}` con `accounts.rtn` y `${customer_tax_document}` / `${registro_tributario_cliente}` con `persons.rtn`. El TXT incluye RTN del emisor y RTN Cliente cuando existen. Si no hay RTN, se omite sin inventar valores. Se leen los datos actuales de la cuenta y cliente al imprimir, tambien en reimpresiones; no se crea una copia historica del RTN en esta version.

Limitaciones deliberadas: siguen pendientes los datos de exoneracion, cuyos placeholders se envian vacios. Esto no certifica una factura fiscal completa; antes de uso fiscal se deben validar la plantilla/reglas aplicables. No hay logo remoto ni imagenes por linea. Las modificaciones futuras a la plantilla por defecto del proveedor deben verificarse contra el adaptador.

## Despliegue coordinado

Migraciones nuevas, en este orden:

1. `supabase/migrations/20261001180000_imprent_integration.sql`.
2. `supabase/migrations/20261001181000_invoice_correlative_snapshot.sql`.
3. `supabase/migrations/20261002001000_account_person_rtn.sql`.

Requieren el esquema actual, incluido `supabase/correlatives_control.sql`, RLS, perfiles y el bootstrap existente. Aplicarlas mediante el flujo de migraciones, no pegarlas manualmente. No volver a ejecutar los SQL historicos de correlativos/RLS despues, porque pueden restablecer permisos anteriores.

Configurar secretos server-side `IMPRENT_BASE_URL` (raiz sin `/api/v1`) e `IMPRENT_INTERNAL_ADMIN_KEY`. Si esa URL usa HTTP, configurar ademas `IMPRENT_ALLOW_INSECURE_HTTP=true`; no se necesita esta bandera con HTTPS y debe eliminarse cuando haya TLS. Las funciones tambien requieren `SUPABASE_URL` y `SERVICE_ROLE_KEY` o `SUPABASE_SERVICE_ROLE_KEY`, como las existentes. No copiar valores a `.env` del frontend.

Desplegar `imprent-integration` y `generate-invoice-pdf` junto con `_shared`. Publicar el frontend/build de esta version. Coordinar una ventana corta para el cambio de numeracion: el frontend antiguo usa la RPC revocada y el nuevo necesita la migracion. Solicitar recarga de sesiones abiertas despues de publicar.

Para RTN, aplicar su migracion antes del frontend y redesplegar tambien `generate-invoice-print-txt`, ademas de ambas funciones de Imprent. Los registros existentes conservan RTN nulo; no se modifica ninguna numeracion.

No se han aplicado estas migraciones, desplegado funciones, configurado secretos ni creado cuentas externas desde esta implementacion.

## Validacion

Pruebas locales:

```text
node --test tests/invoicePdfPayload.test.js tests/budgetExecution.test.js tests/customerCredits.test.js tests/transactionEditorLoad.test.js
deno test --no-config --no-lock --node-modules-dir=none --allow-read --allow-env tests/invoicePrinting.database.test.ts tests/imprentSecurity.test.ts tests/budgetIncome.database.test.ts tests/customerCredits.database.test.ts
deno test --no-config --no-lock --node-modules-dir=none --allow-read tests/rtn.database.test.ts
deno check --no-config --no-lock --node-modules-dir=none supabase/functions/imprent-integration/index.ts supabase/functions/generate-invoice-pdf/index.ts
npm.cmd run build
```

Aceptacion pendiente en entorno conectado: activar cuenta, fallo/reintento de billing, subir DOCX, elegir default, descargar DOCX/PDF, imprimir en Chrome/Edge/Safari, validar etiquetas y cifras de la plantilla por defecto, cambiar de cuenta durante consultas, probar perfiles sin ventas, crear dos facturas concurrentes, agotar rango, comparar contado/credito y verificar que PDF/TXT no avancen el contador.

Fuentes de referencia: handoffs `imprent-integracion-y-migracion.md` y `printing.md` de Unico; adaptador `_shared/imprent.ts`, migraciones de correlativos de Unico y etiquetas reales del `invoiceUnicoERP.docx` del repositorio local de Imprent. Se adapto al esquema/permisos de Financiera; no se copiaron tablas de sucursales ni registry_types.
