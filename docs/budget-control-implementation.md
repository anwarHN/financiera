# Control presupuestario: implementacion

## Cambios preparados
- Consultas compartidas por pantalla y Excel en `supabase/functions/_shared/budgetExecution.js`.
- Paginacion compartida en `supabase/functions/_shared/fetchAllPages.js`, tambien usada por `reportsService.js`. Cada consulta debe ordenar por una clave estable. Se avanza por filas recibidas hasta una pagina vacia; funciona incluso si el servidor limita a menos de 1000 filas.
- Presupuestos, lineas y movimientos de ejecucion se paginan. Listas IN se dividen en grupos de 100.
- Ejecucion presupuestaria conserva solo conceptos presupuestados. Ejecucion por proyecto incluye gastos sin presupuesto, con su nombre y signo normalizado segun isExpense.
- Filtros de cuenta, actividad, proyecto, fechas y moneda se ejecutan en servidor con relacion transactions !inner.
- Excel usa el mismo calculo, incluye totales y conserva almacenamiento y retencion existentes. Se verifican permisos de los dos reportes en la funcion de exportacion.
- Presupuesto tiene moneda requerida en formulario. Proyecto requiere seleccionar una moneda y filtra tanto presupuestos como gastos. No hay conversion de divisas.
- La moneda del presupuesto es la fuente de verdad; un filtro incompatible se rechaza.
- El rango de fechas filtra movimientos; no prorratea ni restringe los presupuestos activos del proyecto, conservando el comportamiento anterior.

## Migracion y despliegue
1. Aplicar por el flujo de migraciones `supabase/migrations/20260918203435_budget_currency_control.sql`.
2. Revisar presupuestos cuyo currencyId siga nulo: cuentas sin moneda local deben configurarla y editar esos presupuestos. Se conserva nullable para no impedir migrar esas cuentas ni asignar una moneda arbitraria.
3. Desplegar `export-report` incluyendo sus modulos `_shared`.
4. Publicar frontend.

No se ha aplicado la migracion ni desplegado la funcion desde esta tarea.

## Validacion
- `node --test tests/budgetExecution.test.js`: mas de 1000 movimientos, limite servidor menor a 1000, aislamiento por cuenta/moneda/proyecto/fechas, gastos sin presupuesto y propagacion de errores.
- `npm run build`.
- `deno check supabase/functions/export-report/index.ts`.
- Pendiente en entorno integrado: comparar SQL, pantalla y archivo XLSX real; comprobar permisos con usuario externo y cambio de cuenta en navegador.

Para comparar ejecutado por proyecto en SQL, usar los mismos parametros:

```sql
select td."conceptId",
       sum(case when c."isExpense" then abs(coalesce(td.total, 0))
                else coalesce(td.total, 0) end) as executed
from public."transactionDetails" td
join public.transactions t on t.id = td."transactionId"
left join public.concepts c on c.id = td."conceptId"
where t."accountId" = :account_id and t."projectId" = :project_id
  and t."isActive" = true and t."currencyId" = :currency_id
  and t.date >= :date_from and t.date <= :date_to
group by td."conceptId";
```

Para ejecucion de un presupuesto, limitar adicionalmente conceptos a sus budget_lines,
usar su moneda, sus fechas cuando no se especifican y su proyecto solo si lo tiene.
