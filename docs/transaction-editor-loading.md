# Carga del editor de transacciones

## Correcciones

- La transaccion y los catalogos se resuelven antes de mostrar el formulario. Ya no compiten dos cargas por `isLoading`.
- Se ignoran respuestas pendientes tras cambiar cuenta, transaccion, modulo o modo de entrada, y tras desmontar el formulario.
- Un fallo en un catalogo necesario bloquea la edicion y permite reintentar; no se sustituye silenciosamente por una lista vacia. Las sugerencias de tags son opcionales.
- La moneda local se asigna solo al crear, no reemplaza la moneda de un documento en edicion.
- La consulta de cabecera incluye `isAccountReceivable` e `isAccountPayable`, necesarios para conservar contado/credito; el detalle incluye `sellerId`.
- La lectura para editar valida cuenta y tipo. Los detalles se paginan para evitar perder lineas al guardar documentos grandes.
- Si una opcion seleccionada no aparece en el catalogo (inactiva o fuera de la primera pagina), se recupera por ID y cuenta. No se habilitan indiscriminadamente todos los registros inactivos. Se normalizan IDs numericos para los lookups.

## Validacion

`node --test tests/transactionEditorLoad.test.js` verifica ambos ordenes de llegada, errores de catalogos, cuenta incorrecta y recuperacion de opciones asignadas.

Pendiente validacion en navegador con red lenta, cambio rapido entre documentos, venta/compra a credito, vendedor inactivo y proyecto/forma de pago inactivos. No requiere migracion ni despliegue de Edge Functions.
