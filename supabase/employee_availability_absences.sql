-- Employee availability and absences for appointments calendar.

create table if not exists public.employee_availability (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  "accountId" bigint not null references public.accounts(id),
  "employeeId" bigint not null references public.employes(id),
  "dayOfWeek" smallint not null,
  "startTime" time not null,
  "endTime" time not null,
  "isActive" boolean not null default true,
  "createdById" uuid not null default auth.uid() references auth.users(id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_availability_day_of_week_check'
  ) then
    alter table public.employee_availability
    add constraint employee_availability_day_of_week_check
    check ("dayOfWeek" between 0 and 6);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_availability_time_range_check'
  ) then
    alter table public.employee_availability
    add constraint employee_availability_time_range_check
    check ("endTime" > "startTime");
  end if;
end $$;

create unique index if not exists employee_availability_employee_day_unique
  on public.employee_availability ("employeeId", "dayOfWeek")
  where "isActive" = true;

create table if not exists public.employee_absences (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  "accountId" bigint not null references public.accounts(id),
  "employeeId" bigint not null references public.employes(id),
  "dateFrom" date not null,
  "dateTo" date not null,
  reason text,
  "isActive" boolean not null default true,
  "createdById" uuid not null default auth.uid() references auth.users(id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_absences_date_range_check'
  ) then
    alter table public.employee_absences
    add constraint employee_absences_date_range_check
    check ("dateTo" >= "dateFrom");
  end if;
end $$;

create index if not exists employee_absences_employee_date_idx
  on public.employee_absences ("employeeId", "dateFrom", "dateTo");
