import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import assert from "node:assert/strict";

Deno.test("RTN migration preserves existing records, leading zeros and validates optional identifiers", async () => {
  const db = new PGlite();
  try {
    await db.exec('create table accounts(id bigint primary key); create table persons(id bigint primary key, "accountId" bigint); insert into accounts values(1); insert into persons values(1,1);');
    await db.exec(await Deno.readTextFile("supabase/migrations/20261002001000_account_person_rtn.sql"));
    for (const table of ["accounts", "persons"]) {
      assert.equal((await db.query<{ rtn: string | null }>(`select rtn from ${table}`)).rows[0].rtn, null);
      await db.exec(`update ${table} set rtn='01011999123456'`);
      assert.equal((await db.query<{ rtn: string | null }>(`select rtn from ${table}`)).rows[0].rtn, "01011999123456");
      for (const value of ["", "123", "010119991234567", "0101-1999123456", "0101199912345A", " 01011999123456"]) {
        await assert.rejects(db.query(`update ${table} set rtn=$1`, [value]), /rtn_format/);
      }
      await db.exec(`update ${table} set rtn=null`);
    }
  } finally { await db.close(); }
});
