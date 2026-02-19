-- Employees active flag for soft-deactivation.

alter table public.employes
add column if not exists "isActive" boolean not null default true;

update public.employes
set "isActive" = true
where "isActive" is null;
