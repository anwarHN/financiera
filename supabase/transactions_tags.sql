alter table public.transactions
add column if not exists tags text[] not null default '{}';
