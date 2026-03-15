-- Backfill delivery history from transactionDetails."historicalQuantityDelivered"
-- Goal:
-- 1. Extend inventory_delivery_history with metadata to distinguish inferred rows.
-- 2. Insert inferred history rows using invoice date as deliveryDate.
-- 3. Provide validation queries before changing application logic.

alter table public.inventory_delivery_history
  add column if not exists "isInferred" boolean not null default false;

alter table public.inventory_delivery_history
  add column if not exists source text not null default 'delivery';

create index if not exists inventory_delivery_history_detail_idx
  on public.inventory_delivery_history ("transactionDetailId");

create index if not exists inventory_delivery_history_date_idx
  on public.inventory_delivery_history ("deliveryDate");

-- Optional normalization for legacy rows inserted before metadata existed.
update public.inventory_delivery_history
set source = case
  when "deliveryBatchKey" like 'invoice-delivery-%' then 'invoice_delivery'
  else 'delivery'
end,
"isInferred" = false
where source = 'delivery'
  and "isInferred" = false;

-- Insert one inferred row per detail that still carries historical delivered quantity.
insert into public.inventory_delivery_history (
  "accountId",
  "transactionId",
  "transactionDetailId",
  "conceptId",
  "deliveryBatchKey",
  "deliveryDate",
  quantity,
  "isInferred",
  source
)
select
  t."accountId",
  t.id,
  td.id,
  td."conceptId",
  'historical-migration-' || td.id::text,
  t.date,
  least(
    abs(coalesce(td.quantity, 0)),
    greatest(coalesce(td."historicalQuantityDelivered", 0), 0)
  ) as quantity,
  true,
  'historical_migration'
from public."transactionDetails" td
inner join public.transactions t
  on t.id = td."transactionId"
where t."isActive" = true
  and t.type = 1
  and greatest(coalesce(td."historicalQuantityDelivered", 0), 0) > 0
  and not exists (
    select 1
    from public.inventory_delivery_history idh
    where idh."transactionDetailId" = td.id
      and idh.source = 'historical_migration'
  );

-- Validation by detail:
-- Fields model:
--   historicalQuantityDelivered + quantityDelivered
-- History model:
--   sum(inventory_delivery_history.quantity)
with history_by_detail as (
  select
    idh."transactionDetailId",
    sum(coalesce(idh.quantity, 0)) as delivered_in_history
  from public.inventory_delivery_history idh
  group by idh."transactionDetailId"
)
select
  td.id as transaction_detail_id,
  td."transactionId",
  td."conceptId",
  abs(coalesce(td.quantity, 0)) as quantity,
  greatest(coalesce(td."historicalQuantityDelivered", 0), 0) + greatest(coalesce(td."quantityDelivered", 0), 0) as delivered_using_fields,
  coalesce(h.delivered_in_history, 0) as delivered_using_history,
  (coalesce(h.delivered_in_history, 0)
    - (greatest(coalesce(td."historicalQuantityDelivered", 0), 0) + greatest(coalesce(td."quantityDelivered", 0), 0))) as difference
from public."transactionDetails" td
inner join public.transactions t
  on t.id = td."transactionId"
left join history_by_detail h
  on h."transactionDetailId" = td.id
where t."isActive" = true
  and t.type = 1
  and (
    greatest(coalesce(td."historicalQuantityDelivered", 0), 0) > 0
    or greatest(coalesce(td."quantityDelivered", 0), 0) > 0
    or coalesce(h.delivered_in_history, 0) > 0
  )
order by td."transactionId", td.id;

-- Validation by product:
with history_by_detail as (
  select
    idh."transactionDetailId",
    sum(coalesce(idh.quantity, 0)) as delivered_in_history
  from public.inventory_delivery_history idh
  group by idh."transactionDetailId"
)
select
  td."conceptId" as product_id,
  max(c.name) as product_name,
  sum(greatest(coalesce(td."historicalQuantityDelivered", 0), 0) + greatest(coalesce(td."quantityDelivered", 0), 0)) as delivered_using_fields,
  sum(coalesce(h.delivered_in_history, 0)) as delivered_using_history,
  sum(coalesce(h.delivered_in_history, 0))
    - sum(greatest(coalesce(td."historicalQuantityDelivered", 0), 0) + greatest(coalesce(td."quantityDelivered", 0), 0)) as difference
from public."transactionDetails" td
inner join public.transactions t
  on t.id = td."transactionId"
left join public.concepts c
  on c.id = td."conceptId"
left join history_by_detail h
  on h."transactionDetailId" = td.id
where t."isActive" = true
  and t.type = 1
group by td."conceptId"
having sum(coalesce(h.delivered_in_history, 0))
  <> sum(greatest(coalesce(td."historicalQuantityDelivered", 0), 0) + greatest(coalesce(td."quantityDelivered", 0), 0))
order by max(c.name);
