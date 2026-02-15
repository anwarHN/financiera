alter table public.accounts
  add column if not exists email varchar,
  add column if not exists phone varchar,
  add column if not exists address text;
