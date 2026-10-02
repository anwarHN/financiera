begin;
-- Keep RTN as text: leading zeroes are significant. Existing records stay NULL.
alter table public.accounts add column rtn text;
alter table public.persons add column rtn text;
alter table public.accounts add constraint accounts_rtn_format check (rtn is null or rtn ~ '^[0-9]{14}$');
alter table public.persons add constraint persons_rtn_format check (rtn is null or rtn ~ '^[0-9]{14}$');
comment on column public.accounts.rtn is 'RTN del emisor, opcional; 14 digitos sin separadores.';
comment on column public.persons.rtn is 'RTN del cliente/proveedor, opcional; 14 digitos sin separadores.';
commit;
