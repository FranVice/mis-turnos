const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');

test('Nexo · citas: migración, RLS, horas y versiones', async t => {
  const db = new PGlite();
  const f='00000000-0000-0000-0000-000000000001', a='00000000-0000-0000-0000-000000000002', x='00000000-0000-0000-0000-000000000003';
  const cal='10000000-0000-0000-0000-000000000001', other='10000000-0000-0000-0000-000000000002';
  const person='20000000-0000-0000-0000-000000000001', partner='20000000-0000-0000-0000-000000000002', stranger='20000000-0000-0000-0000-000000000003';
  const as = (uid) => db.exec(`set request.jwt.claim.sub='${uid}';`);
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create publication supabase_realtime;
      alter default privileges in schema public grant all on tables to anon, authenticated;
      insert into auth.users values ('${f}','franklin@test'),('${a}','almudena@test'),('${x}','stranger@test');`);
    const migrations = fs.readdirSync('supabase/migrations').sort();
    await db.exec(fs.readFileSync('supabase/migrations/'+migrations[0],'utf8'));
    await db.exec(`insert into public.calendars(id,name) values ('${cal}','Familia'),('${other}','Otra');
      insert into public.people(id,calendar_id,display_name,initial,color,user_id) values
      ('${person}','${cal}','Franklin','F','#2563EB','${f}'),
      ('${partner}','${cal}','Almudena','A','#C2410C','${a}'),
      ('${stranger}','${other}','Ajeno','X','#15803D','${x}');`);
    for (const file of migrations.slice(1)) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
    await db.exec('set role authenticated;'); await as(f);

    const add = (title, date, start=null, end=null, who=null, group=cal) =>
      db.query('insert into events(calendar_id,title,event_date,start_time,end_time,person_id) values ($1,$2,$3,$4,$5,$6) returning *',[group,title,date,start,end,who]);

    await t.test('cita familiar de todo el día y cita personal con horas', async () => {
      const {rows:[fam]} = await add('Cumpleaños de mamá','2026-11-28');
      assert.equal(fam.person_id, null); assert.equal(fam.start_time, null); assert.equal(fam.created_by, f);
      const {rows:[mine]} = await add('Dentista','2026-11-20','10:30','11:15',partner);
      assert.equal(mine.person_id, partner); assert.equal(mine.start_time,'10:30:00');
    });

    await t.test('validaciones de horas, título y persona ajena', async () => {
      await assert.rejects(add('Mal','2026-11-20','12:00','11:00'), /events_end_after_start/);
      await assert.rejects(add('Sin inicio','2026-11-20',null,'11:00'), /events_end_needs_start/);
      await assert.rejects(add('  ','2026-11-20'), /check/);
      await assert.rejects(add('Intrusa','2026-11-20',null,null,stranger), /foreign key/);
    });

    await t.test('edición: versión, autoría y campos inmutables', async () => {
      const {rows:[ev]} = await db.query("select * from events where title='Dentista'");
      await as(a);
      const {rows:[up]} = await db.query("update events set start_time='11:00', end_time=null, calendar_id=$2, created_by=$3 where id=$1 and version=$4 returning *",[ev.id, other, x, ev.version]);
      assert.equal(up.version, 2); assert.equal(up.updated_by, a); assert.equal(up.calendar_id, cal); assert.equal(up.created_by, f);
      const stale = await db.query("update events set title='x' where id=$1 and version=1 returning id",[ev.id]);
      assert.equal(stale.rows.length, 0);
      await as(f);
    });

    await t.test('RLS: otra familia y anon sin acceso; autoría no falsificable', async () => {
      await assert.rejects(add('Ajena','2026-11-20',null,null,null,other), /row-level security/);
      await assert.rejects(db.query('insert into events(calendar_id,title,event_date,created_by,updated_by) values ($1,$2,$3,$4,$4)',[cal,'Falsa','2026-11-21',a]), /row-level security/);
      await as(x);
      assert.equal((await db.query('select * from events')).rows.length, 0);
      assert.equal((await db.query("update events set title='hack' returning id")).rows.length, 0);
      assert.equal((await db.query('delete from events returning id')).rows.length, 0);
      await as(f);
      assert.equal((await db.query('select * from events')).rows.length, 2);
      await db.exec('set role anon;');
      await assert.rejects(db.query('select * from events'), /permission denied/);
      await db.exec('set role authenticated;');
    });

    await t.test('la pareja borra una cita familiar', async () => {
      await as(a);
      assert.equal((await db.query("delete from events where title='Cumpleaños de mamá' returning id")).rows.length, 1);
    });
  } finally { await db.close(); }
});
