-- Keep monetary arithmetic numeric before using round(value, scale).
-- transactionDetails.total may be double precision in existing accounts.
create or replace function public.validate_payment_transaction_detail_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_total numeric; v_paid numeric; v_active boolean;
begin
  if new."transactionPaidId" is null then return new; end if;
  select abs(total::numeric), "isActive" into v_total,v_active
    from public.transactions where id = new."transactionPaidId" for update;
  if not found or not v_active then raise exception 'Referenced invoice is missing or voided'; end if;
  select coalesce(sum(abs(d.total::numeric)),0) into v_paid from public."transactionDetails" d
    join public.transactions t on t.id=d."transactionId"
    where d."transactionPaidId"=new."transactionPaidId" and t."isActive" and (tg_op='INSERT' or d.id<>new.id);
  v_paid := v_paid + coalesce((select sum(amount) from public.customer_credit_entries
    where kind='application' and "invoiceId"=new."transactionPaidId" and "voidedOn" is null),0);
  if round(v_paid+abs(coalesce(new.total::numeric,0)),2)>round(v_total,2) then
    raise exception 'Payment exceeds invoice balance';
  end if;
  return new;
end;
$$;
