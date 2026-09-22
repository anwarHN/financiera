import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import assert from "node:assert/strict";

Deno.test("customer credit migration and complete monetary lifecycle in PostgreSQL", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('00000000-0000-0000-0000-000000000001');
      create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
      create table public.accounts(id bigint primary key);
      insert into accounts values(8),(9);
      create function public.user_belongs_to_account(bigint) returns boolean language sql as $$ select $1 = 8 $$;
      create table persons(id bigint primary key, "accountId" bigint, type int, name text);
      insert into persons values(1,8,1,'Client'),(2,9,1,'Other');
      create table currencies(id bigint primary key,"accountId" bigint);
      insert into currencies values(1,8),(2,8);
      create table account_profiles(id bigint primary key,"accountId" bigint,"isSystemAdmin" boolean,"canVoidTransactions" boolean,permissions jsonb);
      insert into account_profiles values(1,8,false,true,'{"transactions":{"read":true,"create":true}}');
      create table users_to_profiles("accountId" bigint,"userId" uuid,"profileId" bigint);
      insert into users_to_profiles values(8,auth.uid(),1);
      create table payment_methods(id bigint primary key,"accountId" bigint,is_active boolean);
      insert into payment_methods values(1,8,true);
      create table account_payment_forms(id bigint primary key,"accountId" bigint,"isActive" boolean,kind text);
      insert into account_payment_forms values(1,8,true,'cashbox');
      create table concepts(id bigint primary key,"accountId" bigint,"isIncomingPaymentConcept" boolean,"isOutgoingPaymentConcept" boolean);
      insert into concepts values(1,8,true,false),(2,8,false,true);
      create table transactions(
        id bigint generated always as identity primary key,"accountId" bigint,"personId" bigint,"currencyId" bigint,
        date date,type int,name text,status int,"createdById" uuid,net numeric,discounts numeric,taxes numeric,"additionalCharges" numeric,
        total numeric,balance numeric,payments numeric,"isAccountReceivable" boolean,"isAccountPayable" boolean,
        "isIncomingPayment" boolean,"isOutcomingPayment" boolean,"isActive" boolean,"paymentMethodId" bigint,"accountPaymentFormId" bigint,
        "referenceNumber" text,"isReconciled" boolean,"reconciledAt" date,"isEmployeeLoan" boolean default false,tags text[]
      );
      create table "transactionDetails"(
        id bigint generated always as identity primary key,"transactionId" bigint references transactions(id),
        "transactionPaidId" bigint references transactions(id),"conceptId" bigint,quantity numeric,price numeric,net numeric,total numeric,
        tax numeric,"taxPercentage" numeric,discount numeric,"discountPercentage" numeric,"additionalCharges" numeric,"createdById" uuid
      );
      insert into transactions("accountId","personId","currencyId",date,total,balance,payments,"isAccountReceivable","isActive")
      values(8,1,1,'2026-01-01',1000,1000,0,true,true),(8,1,1,'2026-01-01',500,500,0,true,true);
    `);
    await db.exec(await Deno.readTextFile("supabase/migrations/20260922005224_customer_credit_ledger.sql"));
    await db.exec(`create trigger check_payment_balance_before_insert before insert on public."transactionDetails"
      for each row execute function public.validate_payment_transaction_detail_balance();`);
    const run = async (action: string, amount: number | null, credit: number | null = null, invoice: number | null = null, request = crypto.randomUUID()) => {
      const result = await db.query<{result: {id: number}}>(`select public.customer_credit_command(8,$1,1,1,$2,'2026-01-10','Test',$3,$4,1,1,$5) as result`,
        [action, amount, credit, invoice, request]);
      return result.rows[0].result;
    };
    const balance = async (id: number) => Number((await db.query<{balance: string}>('select balance from transactions where id=$1',[id])).rows[0].balance);
    const key = crypto.randomUUID();
    await run("receive",1300,null,1,key);
    await run("receive",1300,null,1,key);
    assert.equal((await db.query('select * from transactions where type=6')).rows.length,1);
    assert.equal(await balance(1),0);
    const credit = Number((await db.query<{id:number}>("select id from customer_credit_entries where kind='excess'")).rows[0].id);
    const application = await run("application",120,credit,2);
    assert.equal(await balance(2),380);
    await assert.rejects(run("application",181,credit,2), /available credit/);
    await assert.rejects(db.exec('update transactions set "isActive"=false where id=2'), /Reverse credit applications/);
    await assert.rejects(db.exec('delete from "transactionDetails" where "transactionId"=3'), /cannot be modified/);
    const refund = await run("refund",180,credit);
    assert.equal((await db.query("select * from transactions where type=5")).rows.length,1);
    await assert.rejects(run("refund",1,credit), /available credit/);
    await assert.rejects(db.query(`select public.customer_credit_command(8,'application',1,2,1,'2026-01-10','Test',$1,2,null,null,$2)`, [credit,crypto.randomUUID()]), /Credit not available/);
    await assert.rejects(run("reverse",null,credit), /Reverse applications/);
    const reverseKey = crypto.randomUUID();
    await run("reverse",null,application.id,null,reverseKey);
    await run("reverse",null,application.id,null,reverseKey);
    assert.equal(await balance(2),500);
    const refundEntry = Number((await db.query<{id:number}>("select id from customer_credit_entries where kind='refund'")).rows[0].id);
    await run("reverse",null,refundEntry);
    await run("reverse",null,credit);
    assert.equal(await balance(1),1000);
    const countBefore = (await db.query("select * from transactions")).rows.length;
    await run("opening",50);
    assert.equal((await db.query("select * from transactions")).rows.length,countBefore);
    const openingId = Number((await db.query<{id:number}>("select id from customer_credit_entries where kind='opening'")).rows[0].id);
    const attempts = await Promise.allSettled([run("application",40,openingId,2),run("application",40,openingId,2)]);
    assert.equal(attempts.filter((result) => result.status === "fulfilled").length,1);
    const beforeFailure = (await db.query("select * from transactions")).rows.length;
    await assert.rejects(db.query(`select public.customer_credit_command(8,'receive',1,1,100,'2026-01-10','Test',null,2,1,999,$1)`, [crypto.randomUUID()]), /active payment account/);
    assert.equal((await db.query("select * from transactions")).rows.length,beforeFailure);
    await db.exec("set role authenticated");
    await assert.rejects(db.exec("delete from customer_credit_entries"), /permission denied/);
    await db.exec("reset role");
    await db.exec(`update account_profiles set permissions='{"transactions":{"read":true,"create":false}}'`);
    await assert.rejects(run("opening",20), /Permission denied/);
    await assert.rejects(db.query(`select public.customer_credit_command(9,'opening',2,1,10,'2026-01-10','Test',null,null,null,null,$1)`,[crypto.randomUUID()]), /Access denied/);
    assert.ok(refund.id);
  } finally {
    await db.close();
  }
});
