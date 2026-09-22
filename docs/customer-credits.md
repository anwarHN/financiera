# Saldos a favor de clientes

## Uso
- Cuentas por cobrar > Saldos a favor de clientes (/customer-credits).
- Registrar cobro: identifica cliente, moneda, fecha, referencia, forma de pago y cuenta bancaria/caja. Una factura destino es opcional. El importe aplicado cancela su pendiente y el resto genera credito.
- Los formularios existentes de cobro tambien aceptan excedentes para clientes; los pagos salientes y prestamos de empleados conservan su limite.
- Saldo anterior: registrar exclusivamente credito previamente existente, sin repetir un ingreso de caja/banco ya contabilizado. No se migran saldos automaticamente.
- Aplicar a factura: escoger credito de origen, factura/CxC pendiente de igual cliente y moneda, fecha y monto.
- Devolver saldo: reduce credito y genera pago saliente real.
- Anular movimiento: registra fecha, usuario y referencia de anulacion. Para anular un credito consumido se deben revertir antes sus aplicaciones/devoluciones.

## Datos y reglas
- customer_credit_entries registra origen, aplicaciones y devoluciones, con referencias a documentos y usuario. No permite escrituras directas desde authenticated.
- customer_credit_command realiza cada operacion completa dentro de una transaccion PostgreSQL, valida pertenencia y permisos, bloquea cuenta y factura y usa UUID de solicitud para evitar duplicados en reintentos.
- Crear requiere transactions.create; consultar transactions.read; anular canVoidTransactions. La lectura para reportes respeta reports.read/receivable.
- No se permite mezclar cuentas, clientes o monedas, sobreaplicar credito o sobrepagar la factura mediante aplicaciones.
- El cobro completo afecta caja/banco una sola vez; aplicaciones y saldos anteriores no crean transacciones de efectivo. Devoluciones crean un pago saliente.
- Se preserva el historial; no se borran origenes de credito. Sus detalles e importes quedan protegidos contra edicion.
- Las aplicaciones no pueden preceder al credito/factura; consumos retroactivos anteriores a otros movimientos se rechazan para no invalidar saldos historicos.
- El reporte CxC exige una moneda: muestra deuda positiva, creditos negativos y neto; incluye clientes con credito aunque no tengan facturas pendientes. La exportacion usa los mismos calculos.
- El resumen CxC dentro de flujo de caja conserva deuda bruta pendiente (no compensa creditos sin aplicar).

## Despliegue
1. Aplicar las migraciones 20260922005224_customer_credit_ledger.sql y 20260922150419_fix_customer_payment_numeric_round.sql por el flujo de migraciones.
2. Desplegar export-report con _shared/customerCredits.js.
3. Publicar frontend.

No se ha aplicado ni desplegado en Supabase remoto durante esta implementacion.
La migracion requiere el esquema existente, perfiles y triggers de payment_forms_and_ap.sql.

## Validacion
- node --test tests/customerCredits.test.js tests/budgetExecution.test.js
- deno test --no-config --no-lock --node-modules-dir=none --allow-read --allow-env tests/customerCredits.database.test.ts
- deno check supabase/functions/export-report/index.ts
- npm run build

La prueba SQL usa PostgreSQL embebido (PGlite) y un esquema de prueba: valida migracion,
reproduce el error round(double precision, integer) con columnas double precision y verifica su correccion,
cobro 1300/factura 1000, aplicaciones parciales, devolucion, reversas, idempotencia,
rechazo de sobreconsumo, moneda/cuenta ajena, permisos y ausencia de escrituras parciales.
Pendiente validar en staging con el esquema y triggers completos, dos sesiones concurrentes,
RLS/PostgREST, conciliacion, pantalla y descarga XLSX real antes de desplegar.
