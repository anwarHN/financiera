-- Enable RLS in all tenant tables
alter table public.accounts enable row level security;
alter table public."usersToAccounts" enable row level security;
alter table public.persons enable row level security;
alter table public.concepts enable row level security;
alter table public.contacts enable row level security;
alter table public.currencies enable row level security;
alter table public.employes enable row level security;
alter table public.transactions enable row level security;
alter table public."transactionDetails" enable row level security;
alter table public.projects enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_lines enable row level security;

-- Helper function to identify whether user belongs to account
create or replace function public.user_belongs_to_account(target_account_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."usersToAccounts" uta
    where uta."userId" = auth.uid()
      and uta."accountId" = target_account_id
  );
$$;

-- accounts: only users associated to the account can query it
drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own"
on public.accounts
for select
using (
  public.user_belongs_to_account(id)
);

-- accounts: authenticated user can create only its own account and owner relation
drop policy if exists "accounts_insert_own" on public.accounts;
create policy "accounts_insert_own"
on public.accounts
for insert
to authenticated
with check ("createdById" = auth.uid());

drop policy if exists "users_to_accounts_select_own" on public."usersToAccounts";
create policy "users_to_accounts_select_own"
on public."usersToAccounts"
for select
using ("userId" = auth.uid() or public.user_belongs_to_account("accountId"));

drop policy if exists "users_to_accounts_insert_own" on public."usersToAccounts";
create policy "users_to_accounts_insert_own"
on public."usersToAccounts"
for insert
to authenticated
with check ("userId" = auth.uid());

-- Generic tenant policy template
drop policy if exists "persons_tenant_access" on public.persons;
create policy "persons_tenant_access"
on public.persons
for all
to authenticated
using (public.user_belongs_to_account("accountId"))
with check (public.user_belongs_to_account("accountId"));

drop policy if exists "concepts_tenant_access" on public.concepts;
create policy "concepts_tenant_access"
on public.concepts
for all
to authenticated
using (public.user_belongs_to_account("accountId"))
with check (public.user_belongs_to_account("accountId"));

drop policy if exists "employes_tenant_access" on public.employes;
create policy "employes_tenant_access"
on public.employes
for all
to authenticated
using (public.user_belongs_to_account("accountId"))
with check (public.user_belongs_to_account("accountId"));

drop policy if exists "transactions_tenant_access" on public.transactions;
create policy "transactions_tenant_access"
on public.transactions
for all
to authenticated
using (public.user_belongs_to_account("accountId"))
with check (public.user_belongs_to_account("accountId"));

drop policy if exists "currencies_tenant_access" on public.currencies;
create policy "currencies_tenant_access"
on public.currencies
for all
to authenticated
using ("accountId" is null or public.user_belongs_to_account("accountId"))
with check ("accountId" is null or public.user_belongs_to_account("accountId"));

drop policy if exists "contacts_tenant_access" on public.contacts;
create policy "contacts_tenant_access"
on public.contacts
for all
to authenticated
using (
  "personId" is null or exists (
    select 1 from public.persons p where p.id = "personId" and public.user_belongs_to_account(p."accountId")
  )
)
with check (
  "personId" is null or exists (
    select 1 from public.persons p where p.id = "personId" and public.user_belongs_to_account(p."accountId")
  )
);

drop policy if exists "transaction_details_tenant_access" on public."transactionDetails";
create policy "transaction_details_tenant_access"
on public."transactionDetails"
for all
to authenticated
using (
  exists (
    select 1
    from public.transactions t
    where t.id = "transactionId"
      and public.user_belongs_to_account(t."accountId")
  )
)
with check (
  exists (
    select 1
    from public.transactions t
    where t.id = "transactionId"
      and public.user_belongs_to_account(t."accountId")
  )
);

drop policy if exists "projects_tenant_access" on public.projects;
create policy "projects_tenant_access"
on public.projects
for all
to authenticated
using (public.user_belongs_to_account("accountId"))
with check (public.user_belongs_to_account("accountId"));

drop policy if exists "budgets_tenant_access" on public.budgets;
create policy "budgets_tenant_access"
on public.budgets
for all
to authenticated
using (public.user_belongs_to_account("accountId"))
with check (public.user_belongs_to_account("accountId"));

drop policy if exists "budget_lines_tenant_access" on public.budget_lines;
create policy "budget_lines_tenant_access"
on public.budget_lines
for all
to authenticated
using (
  exists (
    select 1
    from public.budgets b
    where b.id = "budgetId"
      and public.user_belongs_to_account(b."accountId")
  )
)
with check (
  exists (
    select 1
    from public.budgets b
    where b.id = "budgetId"
      and public.user_belongs_to_account(b."accountId")
  )
);
