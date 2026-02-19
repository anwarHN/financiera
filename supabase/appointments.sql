-- Appointments module
-- Stores client appointments, optional employee assignment and attended status.

create table if not exists public.appointments (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  "accountId" bigint not null references public.accounts(id),
  "personId" bigint not null references public.persons(id),
  "employeeId" bigint references public.employes(id),
  title varchar not null,
  notes text,
  "startsAt" timestamptz not null,
  "endsAt" timestamptz not null,
  status varchar not null default 'pending',
  "createdById" uuid not null default auth.uid() references auth.users(id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_status_check'
  ) then
    alter table public.appointments
    add constraint appointments_status_check
    check (status in ('pending', 'attended', 'missed', 'canceled'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_time_range_check'
  ) then
    alter table public.appointments
    add constraint appointments_time_range_check
    check ("endsAt" > "startsAt");
  end if;
end $$;

alter table public.appointments enable row level security;

drop policy if exists "appointments_tenant_access" on public.appointments;
create policy "appointments_tenant_access"
on public.appointments
for all
to authenticated
using (public.user_belongs_to_account("accountId"))
with check (public.user_belongs_to_account("accountId"));

