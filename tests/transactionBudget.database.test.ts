import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import assert from "node:assert/strict";

Deno.test("transaction budget assignment validates account, project, currency and active state", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table budgets(
        id bigint primary key,
        "accountId" bigint not null,
        "projectId" bigint,
        "currencyId" bigint,
        "isActive" boolean not null default true
      );
      create table transactions(
        id bigint primary key,
        "accountId" bigint not null,
        "projectId" bigint,
        "currencyId" bigint,
        name text
      );
      insert into budgets(id,"accountId","projectId","currencyId","isActive") values
        (1,8,7,2,true), (2,8,7,2,false), (3,9,7,2,true), (4,8,9,2,true), (5,8,7,3,true), (6,8,7,null,true);
    `);
    await db.exec(await Deno.readTextFile("supabase/migrations/20261003034436_transaction_budget_assignment.sql"));

    await db.exec(`insert into transactions(id,"accountId","projectId","currencyId","budgetId") values (1,8,7,2,1)`);
    await db.exec(`insert into transactions(id,"accountId","projectId","currencyId","budgetId") values (2,8,null,2,null)`);
    await assert.rejects(db.exec(`insert into transactions(id,"accountId","projectId","currencyId","budgetId") values (3,8,7,2,3)`), /account/);
    await assert.rejects(db.exec(`insert into transactions(id,"accountId","projectId","currencyId","budgetId") values (3,8,7,2,4)`), /project/);
    await assert.rejects(db.exec(`insert into transactions(id,"accountId","projectId","currencyId","budgetId") values (3,8,7,2,5)`), /currency/);
    await assert.rejects(db.exec(`insert into transactions(id,"accountId","projectId","currencyId","budgetId") values (3,8,7,2,6)`), /currency/);
    await assert.rejects(db.exec(`insert into transactions(id,"accountId","projectId","currencyId","budgetId") values (3,8,7,2,2)`), /inactive/);

    await db.exec(`update budgets set "isActive"=false where id=1; update transactions set "currencyId"=2 where id=1`);
    await assert.rejects(db.exec(`update transactions set "budgetId"=2 where id=2`), /project|inactive/);
  } finally {
    await db.close();
  }
});
