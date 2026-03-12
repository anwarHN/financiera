alter table public.employes
  add column if not exists salary numeric not null default 0;

alter table public.transactions
  add column if not exists "affectsPayroll" boolean not null default false;
