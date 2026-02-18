-- Reconciliation date should be date-only (no time component).

alter table public.transactions
alter column "reconciledAt" type date
using (
  case
    when "reconciledAt" is null then null
    else ("reconciledAt" at time zone 'UTC')::date
  end
);
