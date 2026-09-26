# Impuesto de gastos y estado de resultado por proyecto

## Captura

En crear/editar gasto: base sin impuesto + impuesto del gasto + cargos adicionales = total. El impuesto es un importe manual no negativo, inicialmente cero. No se agrega a CxC/CxP manuales ni saldos anteriores.

Se reutilizan `transactionDetails.tax` y `transactions.taxes`; se conserva el signo negativo de egresos. El total completo sigue afectando caja/banco. La edicion carga el impuesto del detalle y lo conserva al guardar otros campos. No se infiere el impuesto de gastos historicos.

## Reporte

`project_income_statement`: Estado de resultado por proyecto. Requiere proyecto y moneda, acepta periodo opcional, no requiere presupuesto ni consulta sus lineas.

- Filas ejecutadas agrupadas por concepto de ingreso/gasto, con base, impuesto y total.
- Ingresos: facturacion sin impuesto, despues de descuentos, incluyendo cargos adicionales. No suma de nuevo cobros.
- Gastos: total registrado menos impuesto. Incluye cargos adicionales.
- Resultado: base de ingresos menos base de gastos. Impuestos de ingresos y gastos separados e informativos, no liquidacion fiscal.
- Hereda exclusiones de anulaciones, prestamos, transferencias, saldos anteriores y operaciones no operativas del motor de ejecucion.
- No calcula costo de mercaderia vendida; no es una utilidad contable completa.
- Los gastos historicos sin impuesto desglosado mantienen el importe original como base.
- La ejecucion presupuestaria sigue usando el gasto completo, con impuesto. Es una diferencia intencional entre reportes.

Pantalla y Excel usan `loadProjectIncomeStatement` y `summarizeIncomeStatement` del modulo compartido. Se conserva paginacion y filtros por cuenta/proyecto/moneda/fecha.

## Devoluciones y permisos

La migracion `20260926022619_project_income_statement_tax.sql` agrega `returnTaxReversal` al detalle. Las nuevas devoluciones conservan el impuesto proporcional original por separado de `budgetIncomeReversal`. Las anteriores quedan sin valoracion de impuesto y producen advertencia en pantalla y Excel.

El reporte tiene permiso propio en Perfiles, desactivado por defecto para perfiles no administradores. Debe habilitarse `reportAccess.project_income_statement`; la exportacion tambien exige permiso explicito. No se modifican permisos existentes en base de datos.

## Entrega

Aplicar la migracion mediante el flujo versionado habitual antes de publicar el frontend, y desplegar `export-report` con el modulo compartido. No se aplico remotamente desde esta tarea.

Validaciones: pruebas Node de ejecucion (incluyendo mas de 1000 filas), PGlite con ambas migraciones, comprobacion de tipos de Edge Function y build de Vite. Pendiente navegador: alta/edicion de gasto con impuesto, cambio de cuenta, perfil con/sin permiso, descarga Excel y anulaciones.
