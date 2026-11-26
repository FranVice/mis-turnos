const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');

test('Nexo · tareas: migración, RLS, versiones y responsables', async t => {
  const db = new PGlite();
  const f='00000000-0000-0000-0000-000000000001', a='00000000-0000-0000-0000-000000000002', x='00000000-0000-0000-0000-000000000003';
  const cal='10000000-0000-0000-0000-000000000001', other='10000000-0000-0000-0000-000000000002';
  const person='20000000-0000-0000-0000-000000000001', partner='20000000-0000-0000-0000-000000000002', stranger='20000000-0000-0000-0000-000000000003';
  const as = (uid) => db.exec(`set request.jwt.claim.sub='${uid}';`);
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
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
      ('${stranger}','${other}','Ajeno','X','#15803D','${x}');
      insert into shifts(calendar_id,person_id,shift_date,kind,start_time,end_time) values ('${cal}','${person}','2026-01-01','manana','06:00','14:00');`);
    for (const file of migrations.slice(1)) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
    await db.exec('set role authenticated;'); await as(f);

    const add = (title, assignee=null, due=null, group=cal) =>
      db.query('insert into tasks(calendar_id,title,assignee_person_id,due_date) values ($1,$2,$3,$4) returning *',[group,title,assignee,due]);

    await t.test('los turnos existentes siguen intactos', async () => {
      const {rows} = await db.query('select count(*)::int n from shifts'); assert.equal(rows[0].n, 1);
    });

    await t.test('crear tareas: de los dos, asignada y con fecha', async () => {
      const {rows:[both]} = await add('Pagar el seguro');
      assert.equal(both.assignee_person_id, null); assert.equal(both.version, 1); assert.equal(both.created_by, f);
      const {rows:[mine]} = await add('Llamar al fontanero', partner, '2026-11-20');
      assert.equal(mine.assignee_person_id, partner); assert.equal(mine.due_date instanceof Date ? mine.due_date.toISOString().slice(0,10) : String(mine.due_date).slice(0,10), '2026-11-20');
    });

    await t.test('validaciones: título vacío y responsable de otra familia', async () => {
      await assert.rejects(add('   '), /check/);
      await assert.rejects(add('Intruso', stranger), /foreign key/);
    });

    await t.test('completar: version sube y done_by lo pone el servidor', async () => {
      const {rows:[task]} = await db.query("select * from tasks where title='Pagar el seguro'");
      await as(a);
      const {rows:[done]} = await db.query('update tasks set done_at=now(), done_by=$2 where id=$1 and version=$3 returning *',[task.id, x, task.version]);
      assert.equal(done.version, 2); assert.equal(done.done_by, a); assert.equal(done.updated_by, a); assert.equal(done.created_by, f);
      // Reabrir borra done_by.
      const {rows:[open]} = await db.query('update tasks set done_at=null where id=$1 returning *',[task.id]);
      assert.equal(open.done_by, null); assert.equal(open.version, 3);
      // Versión obsoleta: no cambia nada.
      const stale = await db.query("update tasks set title='x' where id=$1 and version=$2 returning id",[task.id, 1]);
      assert.equal(stale.rows.length, 0);
      await as(f);
    });

    await t.test('no se puede mover una tarea a otra familia ni falsificar autoría', async () => {
      const {rows:[task]} = await db.query("select * from tasks where title='Llamar al fontanero'");
      const {rows:[moved]} = await db.query('update tasks set calendar_id=$2, created_by=$3 where id=$1 returning *',[task.id, other, x]);
      assert.equal(moved.calendar_id, cal); assert.equal(moved.created_by, f);
      await assert.rejects(db.query('insert into tasks(calendar_id,title,created_by,updated_by) values ($1,$2,$3,$3)',[cal,'Falsa',a]), /row-level security/);
    });

    await t.test('RLS: otra familia no ve ni toca nada; anon sin acceso', async () => {
      await assert.rejects(add('Ajena', null, null, other), /row-level security/);
      await as(x);
      assert.equal((await db.query('select * from tasks')).rows.length, 0);
      assert.equal((await db.query("update tasks set title='hack' returning id")).rows.length, 0);
      assert.equal((await db.query('delete from tasks returning id')).rows.length, 0);
      await as(f);
      assert.equal((await db.query('select * from tasks')).rows.length, 2);
      await db.exec('set role anon;');
      await assert.rejects(db.query('select * from tasks'), /permission denied/);
      await db.exec('set role authenticated;');
    });

    await t.test('borrar una tarea propia de la familia', async () => {
      await as(a);
      const {rows} = await db.query("delete from tasks where title='Llamar al fontanero' returning id");
      assert.equal(rows.length, 1);
    });
  } finally { await db.close(); }
});
