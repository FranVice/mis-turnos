const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');

test('Nexo · economía: plantillas, generación mensual, duplicados y RLS', async t => {
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
      ('${stranger}','${other}','Ajeno','X','#15803D','${x}');`);
    for (const file of migrations.slice(1)) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
    await db.exec('set role authenticated;'); await as(f);

    const template = (section, concept, cents, day=null, starts='2026-11-01', ends=null, who=null) =>
      db.query('insert into fin_recurring(calendar_id,section,concept,amount_cents,day_of_month,starts_on,ends_on,person_id) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *',[cal,section,concept,cents,day,starts,ends,who]);
    const gen = (month, group=cal) => db.query('select public.fin_generate_month($1,$2) n',[group,month]).then(r=>r.rows[0].n);
    const monthRows = (month) => db.query('select * from fin_movements where month=$1 order by concept',[month]).then(r=>r.rows);

    let nomina, luz;
    await t.test('plantillas: nómina el día 31 y luz que termina en diciembre', async () => {
      ({rows:[nomina]} = await template('fixed_income','Nómina Franklin',165000,31,'2026-11-01',null,person));
      ({rows:[luz]} = await template('fixed_expense','Luz',7500,5,'2026-11-01','2026-12-01'));
      await assert.rejects(template('extra_income','Extra',100), /check/);       // solo fijos
      await assert.rejects(template('fixed_expense','Cero',0), /check/);
      await assert.rejects(template('fixed_expense','Mal mes',100,null,'2026-11-15'), /check/);
    });

    await t.test('generar un mes es idempotente y ajusta el día 31 a febrero', async () => {
      assert.equal(await gen('2026-11-01'), 2);
      assert.equal(await gen('2026-11-01'), 0); // segunda vez (o el otro móvil): nada
      const nov = await monthRows('2026-11-01');
      assert.equal(nov.length, 2); assert.ok(nov.every(m => m.status === 'planned'));
      assert.equal(await gen('2027-02-01'), 1); // la luz terminó en diciembre
      const [feb] = await monthRows('2027-02-01');
      assert.equal(feb.concept, 'Nómina Franklin');
      assert.equal(new Date(feb.movement_date).toISOString().slice(0,10), '2027-02-28');
      await assert.rejects(gen('2026-11-15'), /día 1/);
    });

    await t.test('un movimiento omitido no se vuelve a generar ni duplica', async () => {
      const luzNov = (await monthRows('2026-11-01')).find(m => m.concept === 'Luz');
      assert.equal(luzNov.concept, 'Luz');
      const {rows:[skip]} = await db.query("update fin_movements set status='skipped' where id=$1 returning *",[luzNov.id]);
      assert.equal(skip.version, 2);
      assert.equal(await gen('2026-11-01'), 0);
      await assert.rejects(db.query("insert into fin_movements(calendar_id,month,section,concept,amount_cents,recurring_id) values ($1,'2026-11-01','fixed_expense','Luz',7500,$2)",[cal,luz.id]), /fin_movements_one_per_recurring_month/);
    });

    await t.test('movimientos sueltos: gasto variable hecho e ingreso extra', async () => {
      const {rows:[g]} = await db.query("insert into fin_movements(calendar_id,month,section,concept,amount_cents,status,movement_date) values ($1,'2026-11-01','variable_expense','Supermercado',8530,'done','2026-11-18') returning *",[cal]);
      assert.equal(g.recurring_id, null); assert.equal(g.created_by, f);
      await db.query("insert into fin_movements(calendar_id,month,section,concept,amount_cents) values ($1,'2026-11-01','extra_income','Venta bici',12000)",[cal]);
      await assert.rejects(db.query("insert into fin_movements(calendar_id,month,section,concept,amount_cents) values ($1,'2026-11-01','ahorro','X',100)",[cal]), /check/);
    });

    await t.test('la pareja edita con control de versión', async () => {
      await as(a);
      const {rows:[m]} = await db.query("select * from fin_movements where concept='Nómina Franklin' and month='2026-11-01'");
      const {rows:[done]} = await db.query("update fin_movements set status='done', calendar_id=$2 where id=$1 and version=$3 returning *",[m.id, other, m.version]);
      assert.equal(done.status,'done'); assert.equal(done.updated_by,a); assert.equal(done.calendar_id,cal);
      assert.equal((await db.query("update fin_movements set amount_cents=1 where id=$1 and version=$2 returning id",[m.id, m.version])).rows.length, 0);
      await as(f);
    });

    await t.test('borrar una plantilla conserva los movimientos (sin enlace)', async () => {
      await db.query('delete from fin_recurring where id=$1',[luz.id]);
      const rows = await db.query("select recurring_id, status from fin_movements where concept='Luz'");
      assert.equal(rows.rows.length, 1); assert.equal(rows.rows[0].recurring_id, null);
    });

    await t.test('RLS: otra familia, función protegida y anon', async () => {
      await assert.rejects(gen('2026-11-01', other), /Sin acceso/);
      await assert.rejects(db.query("insert into fin_movements(calendar_id,month,section,concept,amount_cents) values ($1,'2026-11-01','variable_expense','Ajeno',100)",[other]), /row-level security/);
      await as(x);
      assert.equal((await db.query('select * from fin_movements')).rows.length, 0);
      assert.equal((await db.query('select * from fin_recurring')).rows.length, 0);
      assert.equal((await db.query("update fin_movements set amount_cents=1 returning id")).rows.length, 0);
      assert.equal((await db.query('delete from fin_recurring returning id')).rows.length, 0);
      await assert.rejects(gen('2026-11-01'), /Sin acceso/);
      await as(f);
      await db.exec('set role anon;');
      await assert.rejects(db.query('select * from fin_movements'), /permission denied/);
      await assert.rejects(db.query("select public.fin_generate_month($1,'2026-11-01')",[cal]), /permission denied/);
      await db.exec('set role authenticated;');
    });
  } finally { await db.close(); }
});
