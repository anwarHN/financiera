-- Report exports infrastructure:
-- 1) Private bucket for generated files.
-- 2) Account-level retention days for automatic cleanup.
-- 3) Daily cleanup job that deletes expired files.

insert into storage.buckets (id, name, public, file_size_limit)
values ('report-exports', 'report-exports', false, 52428800)
on conflict (id) do update
set public = excluded.public;

alter table public.accounts
add column if not exists "reportRetentionDays" integer not null default 30;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounts_report_retention_days_check'
  ) then
    alter table public.accounts
    add constraint accounts_report_retention_days_check
    check ("reportRetentionDays" between 1 and 3650);
  end if;
end $$;

create or replace function public.cleanup_report_exports()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  deleted_count integer := 0;
begin
  with deleted as (
    delete from storage.objects o
    using public.accounts a
    where o.bucket_id = 'report-exports'
      and split_part(o.name, '/', 1) ~ '^[0-9]+$'
      and split_part(o.name, '/', 1)::bigint = a.id
      and o.created_at < now() - make_interval(days => greatest(coalesce(a."reportRetentionDays", 30), 1))
    returning 1
  )
  select count(*) into deleted_count from deleted;

  return deleted_count;
end;
$$;

do $$
begin
  create extension if not exists pg_cron;
exception
  when insufficient_privilege then
    raise notice 'pg_cron extension could not be created from this role.';
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if not exists (select 1 from cron.job where jobname = 'cleanup_report_exports_daily') then
      perform cron.schedule(
        'cleanup_report_exports_daily',
        '15 3 * * *',
        'select public.cleanup_report_exports();'
      );
    end if;
  end if;
end $$;
