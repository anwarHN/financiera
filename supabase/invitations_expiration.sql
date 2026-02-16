-- Invitation lifecycle hardening:
-- - Max validity: 7 days
-- - Resend support via status invalidation
-- - Tracks sent/invalidated timestamps

alter table public.account_user_invitations
add column if not exists "sentAt" timestamptz;

alter table public.account_user_invitations
add column if not exists "expiresAt" timestamptz not null default (now() + interval '7 days');

alter table public.account_user_invitations
add column if not exists "invalidatedAt" timestamptz;

-- Normalize legacy statuses before applying strict constraint.
-- Existing variants are mapped to current lifecycle:
-- pending -> pending
-- sent -> sent
-- linked/accepted -> linked
-- expired -> expired
-- canceled/revoked/invalidated -> invalidated
update public.account_user_invitations
set status = case
  when lower(coalesce(status, '')) in ('pending') then 'pending'
  when lower(coalesce(status, '')) in ('sent') then 'sent'
  when lower(coalesce(status, '')) in ('linked', 'accepted') then 'linked'
  when lower(coalesce(status, '')) in ('expired') then 'expired'
  when lower(coalesce(status, '')) in ('canceled', 'cancelled', 'revoked', 'invalidated') then 'invalidated'
  else 'invalidated'
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_user_invitations_status_check'
  ) then
    alter table public.account_user_invitations
    add constraint account_user_invitations_status_check
    check (status in ('pending', 'sent', 'linked', 'expired', 'invalidated'));
  end if;
end $$;

update public.account_user_invitations
set "expiresAt" = least(coalesce("expiresAt", created_at + interval '7 days'), created_at + interval '7 days')
where "expiresAt" is null or "expiresAt" > created_at + interval '7 days';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_user_invitations_expires_at_range_check'
  ) then
    alter table public.account_user_invitations
    add constraint account_user_invitations_expires_at_range_check
    check ("expiresAt" <= created_at + interval '7 days');
  end if;
end $$;
