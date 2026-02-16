-- Projects + budgets model
-- - Optional project link in transactions
-- - Budget headers and budget lines by concept

create table if not exists public.projects (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  "accountId" bigint not null references public.accounts(id),
  name varchar not null,
  description text,
  "startDate" date,
  "endDate" date,
  "isActive" boolean not null default true,
  "createdById" uuid not null default auth.uid() references auth.users(id)
);

create table if not exists public.budgets (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  "accountId" bigint not null references public.accounts(id),
  "projectId" bigint references public.projects(id),
  name varchar not null,
  "periodType" varchar not null,
  "periodStart" date,
  "periodEnd" date,
  "isActive" boolean not null default true,
  "createdById" uuid not null default auth.uid() references auth.users(id)
);

create table if not exists public.budget_lines (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  "budgetId" bigint not null references public.budgets(id) on delete cascade,
  "conceptId" bigint not null references public.concepts(id),
  amount double precision not null default 0,
  "createdById" uuid not null default auth.uid() references auth.users(id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'budget_lines_budget_concept_unique'
  ) then
    alter table public.budget_lines
    add constraint budget_lines_budget_concept_unique unique ("budgetId", "conceptId");
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'budgets_period_type_check'
  ) then
    alter table public.budgets
    add constraint budgets_period_type_check
    check ("periodType" in ('daily', 'weekly', 'monthly', 'yearly'));
  end if;
end $$;

do $$
begin
  alter table public.budgets alter column "periodStart" drop not null;
  alter table public.budgets alter column "periodEnd" drop not null;
exception
  when others then
    null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'budgets_period_range_check'
  ) then
    alter table public.budgets
    add constraint budgets_period_range_check
    check ("periodStart" is null or "periodEnd" is null or "periodEnd" >= "periodStart");
  end if;
end $$;

alter table public.transactions
add column if not exists "projectId" bigint references public.projects(id);
