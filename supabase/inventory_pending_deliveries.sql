-- Pending deliveries support for sales detail lines.
-- Adds per-line delivery tracking to transaction details.

alter table if exists public."transactionDetails"
  add column if not exists "pendingDelivery" boolean not null default false;

alter table if exists public."transactionDetails"
  add column if not exists "quantityDelivered" numeric not null default 0;

-- Normalize historical rows: assume fully delivered for existing rows
-- to avoid opening legacy invoices as pending by default.
update public."transactionDetails"
set "quantityDelivered" = abs(coalesce(quantity, 0)),
    "pendingDelivery" = false
where coalesce("quantityDelivered", 0) = 0
  and coalesce(quantity, 0) <> 0;

alter table if exists public."transactionDetails"
  drop constraint if exists transaction_details_quantity_delivered_non_negative;

alter table if exists public."transactionDetails"
  add constraint transaction_details_quantity_delivered_non_negative
    check ("quantityDelivered" >= 0);

