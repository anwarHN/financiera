# Presupuestos de ingresos y gastos

## Modelo y reglas

- `budget_lines.lineType`: `income` o `expense`. Importes positivos y unicidad por presupuesto, tipo y concepto.
- `replace_budget_lines` reemplaza detalles en una sola transaccion, con RLS y validacion de cuenta. Un error no borra las lineas anteriores; la cabecera se guarda por separado.
- El formulario filtra conceptos por tipo. El boton de creacion utiliza el tipo de la linea.
- `concepts.incomeConceptId`: concepto de ingreso de un producto o servicio, independiente de su grupo.
- `transactionDetails.incomeAllocation`: snapshot JSON de ID y nombre del concepto al facturar. No se consulta la configuracion actual del producto para recalcular una venta anterior.
- El trigger captura la asignacion; el editor conserva el snapshot al reemplazar detalles. NULL historico se preserva como `{}` al editar, no se reclasifica automaticamente.
- Snapshot JSON sin FK adicional: evita ambiguedad en los joins existentes de PostgREST a `concepts`. El trigger valida pertenencia a la cuenta. No altera RLS ni introduce funciones security definer.
- Las facturas antiguas y productos sin asignacion aparecen como ingresos sin clasificar y suman al resultado. La regularizacion historica requiere un proceso separado y autorizado; este cambio no la ejecuta.
- Las lineas existentes se tipifican segun el concepto, priorizando gasto cuando tiene ambas banderas. Las antiguas lineas por producto requieren reemplazarse por el concepto de ingreso para compararlas con facturacion clasificada.

## Calculo compartido

`supabase/functions/_shared/budgetExecution.js` es la unica implementacion para pantalla y Excel.

- Ingresos: facturas y otros ingresos activos, no cobros. Base de ventas: `net - discount + additionalCharges`, sin impuesto.
- Gastos: conceptos de gasto en gastos/compras, por el total registrado, conservando la base anterior. No se calcula costo de venta ni se contabiliza como gasto cada compra de producto.
- Se excluyen pagos, prestamos, transferencias, depositos, obligaciones internas, saldos anteriores, CxC/CxP manuales y ajustes de inventario.
- Se mantienen filtros de cuenta, proyecto, periodo y moneda, y paginacion de todas las colecciones.
- Ambos reportes incluyen movimientos no presupuestados, identificados como tales. Es un cambio intencional respecto al antiguo reporte de presupuesto que los omitia.
- Resultado: ingresos menos gastos. Variacion favorable: ejecutado menos presupuestado en ingresos y resultado; presupuestado menos ejecutado en gastos.
- No es flujo de caja ni utilidad contable completa.

## Devoluciones

Las nuevas devoluciones guardan `budgetIncomeReversal` en su detalle, proporcional a cantidad y base sin impuesto de la linea original, con su asignacion original. Se descuentan como ingreso negativo en la fecha de devolucion. No crean un reembolso ni modifican saldos de CxC.

Las devoluciones antiguas no se valorizan retroactivamente. Pantalla y Excel identifican que falta valoracion; no debe considerarse definitivo el resultado mientras existan estas advertencias.

## Entrega y validacion

Migracion: `supabase/migrations/20260924052625_budget_income_expense_execution.sql`. Aplicar mediante el flujo habitual de migraciones, antes del frontend nuevo, y desplegar `export-report` junto con su modulo compartido. No se ha desplegado ni aplicado remotamente desde esta tarea.

Validaciones locales:

```text
node --test tests/budgetExecution.test.js
deno test --no-config --no-lock --node-modules-dir=none --allow-read --allow-env tests/budgetIncome.database.test.ts
deno check --no-config --no-lock --node-modules-dir=none supabase/functions/export-report/index.ts
npm.cmd run build
```

Pruebas de aceptacion pendientes en navegador: crear ambos tipos de linea, cambiar cuenta, crear producto con asignacion, facturar a credito, cambiar asignacion y editar factura anterior, comparar pantalla/Excel, anular factura y devolucion. Revisar tambien reportes con historicos sin clasificar y devoluciones sin valor.
