import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import assert from "node:assert/strict";

Deno.test("invoice numbering is atomic, account-scoped, immutable, and excludes opening balances", async () => {
  const db = new PGlite();
  const rows = async (sql: string) => (await db.query<Record<string, any>>(sql)).rows;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
      insert into auth.users values(auth.uid());
      create table accounts(id bigint primary key);
      insert into accounts values(8),(9);
      create table "usersToAccounts"("accountId" bigint,"userId" uuid);
      insert into "usersToAccounts" values (8,auth.uid());
      create table account_profiles(id bigint primary key,"accountId" bigint,"isSystemAdmin" boolean,permissions jsonb);
      create table users_to_profiles("accountId" bigint,"userId" uuid,"profileId" bigint);
      insert into account_profiles values(1,8,true,'{}');
      insert into users_to_profiles values(8,auth.uid(),1);
      create function user_belongs_to_account(a bigint) returns boolean language sql as $$select a=8$$;
      create table transactions(id bigint generated always as identity primary key,"accountId" bigint,type smallint,
        tags text[] default '{}',date date default current_date,"createdById" uuid,total numeric default 0);
      create table "transactionDetails"(id bigint generated always as identity primary key,"transactionId" bigint references transactions,
        "createdById" uuid,quantity numeric check(quantity>0),net numeric);
    `);
    await db.exec(await Deno.readTextFile("supabase/correlatives_control.sql"));
    await db.exec(await Deno.readTextFile("supabase/migrations/20261001180000_imprent_integration.sql"));
    await db.exec(await Deno.readTextFile("supabase/migrations/20261001181000_invoice_correlative_snapshot.sql"));
    await db.exec(await Deno.readTextFile("supabase/migrations/20261002231337_fix_invoice_correlative_bootstrap.sql"));
    await db.exec(`insert into correlatives_control("accountId","transactionType","printPattern","numberTo","limitDate","reference1")
      values(8,1,'001-{number:00000000}',2,'2026-12-31','CAI-A'),(9,1,'OTHER-{0}',100,'2026-12-31','CAI-B');`);
    const preview = (await rows(`select * from reserve_transaction_correlative(8::bigint,1::smallint,'2026-10-01'::date)`))[0];
    assert.equal(Number(preview.next_number), 1);
    assert.equal(preview.print_number, "001-00000001");
    assert.equal(Number((await rows('select "lastNumber" from correlatives_control where id=1'))[0].lastNumber), 0);
    const invoice = `select create_numbered_invoice('{"accountId":8,"type":1,"date":"2026-10-01"}', '[{"quantity":1,"net":100}]')`;
    await db.exec(invoice);
    let tx = (await rows('select * from transactions'))[0];
    assert.equal(tx.printNumber, "001-00000001");
    assert.equal(tx.correlativeSnapshot.reference1, "CAI-A");
    assert.equal(Number(tx.correlativeId), 1);
    await assert.rejects(db.exec(`select create_numbered_invoice('{"accountId":8,"type":1,"date":"2026-10-01"}', '[{"quantity":0}]')`), /check constraint/);
    assert.equal((await rows('select * from transactions')).length, 1);
    assert.equal(Number((await rows('select "lastNumber" from correlatives_control where id=1'))[0].lastNumber), 1);
    await assert.rejects(db.exec(`update transactions set "printNumber"='spoofed' where id=${tx.id}`), /no puede modificarse/);
    await assert.rejects(db.exec(`update correlatives_control set "reference1"='CHANGED' where id=1`), /ya emitio/);
    await assert.rejects(db.exec(`update correlatives_control set "lastNumber"=0 where id=1`), /retroceder/);
    await assert.rejects(db.exec(`select create_numbered_invoice('{"accountId":9,"type":1}', '[{"quantity":1}]')`), /Sin acceso/);
    await assert.rejects(db.exec(`select * from reserve_transaction_correlative(9::bigint,1::smallint,current_date)`), /Sin acceso/);
    await db.exec(invoice);
    await assert.rejects(db.exec(invoice), /No hay correlativo/);
    await db.exec(`update account_profiles set "isSystemAdmin"=false`);
    await assert.rejects(db.exec(invoice), /Sin permiso/);
    await assert.rejects(db.exec(`select * from reserve_transaction_correlative(8::bigint,1::smallint,current_date)`), /Sin permiso/);
    await db.exec(`update account_profiles set "isSystemAdmin"=true`);
    await db.exec(`insert into transactions("accountId",type,tags,"number","printNumber") values
      (8,1,'{__prior_balance__}',99,'LEGACY'), (8,1,'{__manual_receivable__}',null,null), (8,4,'{}',null,null);`);
    tx = (await rows(`select * from transactions where "printNumber"='LEGACY'`))[0];
    assert.equal(tx.correlativeId, null);
    assert.equal(Number((await rows('select "lastNumber" from correlatives_control where id=1'))[0].lastNumber), 2);
    await assert.rejects(db.exec(`update transactions set "correlativeId"=2 where "printNumber"='LEGACY'`), /asignacion/);
    await db.exec(`update correlatives_control set "isActive"=false where id=1;
      insert into correlatives_control("accountId","transactionType","printPattern","limitDate") values(8,1,'EXPIRED-{0}','2026-09-01');`);
    await assert.rejects(db.exec(invoice), /No hay correlativo/);
    assert.equal((await rows(`select format_invoice_number('{0:00}-{number}-{0}',123) as value`))[0].value, '123-123-123');
    await db.exec(`insert into correlatives_control("accountId","transactionType","printPattern") values(8,1,'001-{number:00000000}');`);
    await assert.rejects(db.exec(invoice), /ya fue utilizado/);
    assert.equal((await rows(`select has_function_privilege('authenticated','public.reserve_transaction_correlative(bigint,smallint,date)','execute') as allowed`))[0].allowed, true);
    assert.equal((await rows(`select has_function_privilege('anon','public.reserve_transaction_correlative(bigint,smallint,date)','execute') as allowed`))[0].allowed, false);
    await db.exec(`delete from "transactionDetails"; delete from transactions; delete from correlatives_control;`);
    await db.exec(invoice);
    const automatic = (await rows(`select t."printNumber", c."numberFrom", c."numberTo", c."limitDate", c."lastNumber"
      from transactions t join correlatives_control c on c.id=t."correlativeId"`))[0];
    assert.equal(automatic.printNumber, "FAC-1");
    assert.equal(Number(automatic.numberFrom), 1);
    assert.equal(automatic.numberTo, null);
    assert.equal(automatic.limitDate, null);
    assert.equal(Number(automatic.lastNumber), 1);
    assert.equal((await rows(`select has_table_privilege('authenticated','account_integrations','select') as allowed`))[0].allowed, false);
    assert.equal((await rows(`select claim_imprent_setup(8,'00000000-0000-0000-0000-000000000001') as claimed`))[0].claimed, true);
    assert.equal((await rows(`select claim_imprent_setup(8,'00000000-0000-0000-0000-000000000002') as claimed`))[0].claimed, false);
    await db.exec(`select save_invoice_pdf_template(8,'First','t1','a.docx');
      select save_invoice_pdf_template(8,'Second','t2','b.docx',true);
      select save_invoice_pdf_template(8,'First','t1','a.docx');`);
    const defaults = await rows('select * from invoice_pdf_templates where "isDefault"');
    assert.equal(defaults.length,1); assert.equal(defaults[0].providerTemplateId,'t2');
  } finally { await db.close(); }
});
