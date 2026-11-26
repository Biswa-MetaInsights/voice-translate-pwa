import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
test('Postgres migration: atomic budget, service-only reports, constraints and expiry cleanup',async()=>{
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
    await db.exec(await readFile(new URL('../supabase/migrations/20261126223200_mobile_release_controls.sql',import.meta.url),'utf8'));
    await db.exec('set role service_role');
    const allow = async(fp,minute=2,daily=4)=>(await db.query('select public.vt_mobile_admit($1,$2,$3) as ok',[fp,minute,daily])).rows[0].ok;
    assert.equal(await allow('a'.repeat(64)),true); assert.equal(await allow('a'.repeat(64)),true);
    assert.equal(await allow('a'.repeat(64)),false);
    assert.equal(await allow('b'.repeat(64)),true); assert.equal(await allow('c'.repeat(64)),false);
    await assert.rejects(db.query("select public.vt_mobile_report('bad','speak','')"));
    const report=(await db.query("select public.vt_mobile_report('unsafe','voice-note','test fixture') as id")).rows[0].id;
    assert.match(report,/^[a-f0-9-]{36}$/);
    for (const role of ['anon','authenticated']) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(db.query('select * from public.vt_mobile_reports'));
      await assert.rejects(db.query("select public.vt_mobile_report('unsafe','speak','')"));
      await assert.rejects(db.query('select public.vt_mobile_purge()'));
      await assert.rejects(db.query("select public.vt_mobile_admit($1,1,1)",['d'.repeat(64)]));
    }
    await db.exec("reset role; update public.vt_mobile_reports set expires_at=now()-interval '1 hour'; set role service_role; select public.vt_mobile_purge()");
    assert.equal((await db.query('select count(*) as n from public.vt_mobile_reports')).rows[0].n,0);
  } finally {await db.close();}
});
