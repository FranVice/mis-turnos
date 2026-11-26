const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');

// Espacios de Mis Turnos: enlace general (cada cuenta crea su espacio),
// invitación de pareja, máximo dos miembros, aislamiento, panel y hook.
test('espacios de Mis Turnos: enlace general, pareja, aislamiento y panel', async t => {
  const db = new PGlite();
  const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
  const F = id(1), A = id(2);
  const ANA = id(11), BRU = id(12), CAR = id(21), DAN = id(22), EVA = id(31), UNC = id(41), INT = id(42);
  const fam = '10000000-0000-0000-0000-000000000001';
  const pf = '20000000-0000-0000-0000-000000000001', pa = '20000000-0000-0000-0000-000000000002';
  const as = async uid => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${uid}';`);
  const q = (sql, params = []) => db.query(sql, params);
  const one = async (sql, params = []) => Object.values((await q(sql, params)).rows[0] ?? {})[0];
  try {
    await db.exec(`create role anon; create role authenticated; create role supabase_auth_admin; create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
      create publication supabase_realtime;
      alter default privileges in schema public grant all on tables to anon, authenticated;
      insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
        ('${F}','franklin@test.es',now(),'{}'),('${A}','almudena@test.es',now(),'{}'),
        ('${ANA}','ana@test.es',now(),'{"display_name":"Ana"}'),('${BRU}','bruno@test.es',now(),'{"display_name":"Bruno"}'),
        ('${CAR}','carla@test.es',now(),'{"full_name":"Carla Ruiz"}'),('${DAN}','dani@test.es',now(),'{}'),
        ('${EVA}','eva@test.es',now(),'{"display_name":"Eva"}'),
        ('${UNC}','sinconfirmar@test.es',null,'{}'),('${INT}','intruso@test.es',now(),'{}');`);
    const migrations = fs.readdirSync('supabase/migrations').sort();
    await db.exec(fs.readFileSync('supabase/migrations/' + migrations[0], 'utf8'));
    await db.exec(`insert into public.calendars(id,name) values ('${fam}','Familia');
      insert into public.people(id,calendar_id,display_name,initial,color,user_id) values
      ('${pf}','${fam}','Franklin','F','#2563EB','${F}'),('${pa}','${fam}','Almudena','A','#C2410C','${A}');
      insert into shifts(calendar_id,person_id,shift_date,kind,start_time,end_time,created_by,updated_by)
      values ('${fam}','${pf}','2026-12-01','manana','06:00','14:00','${F}','${F}');`);
    for (const file of migrations.slice(1)) await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));

    await t.test('familia intacta: tipo familiar, Franklin administrador, datos conservados', async () => {
      assert.equal(await one(`select kind from calendars where id='${fam}'`), 'family');
      await as(F); assert.equal(await one('select am_i_admin()'), true);
      assert.equal(await one('select start_mis_turnos()'), fam, 'Franklin ya tiene espacio: lo devuelve');
      assert.equal(await one('select count(*)::int from calendars'), 1);
      await as(A); assert.equal(await one('select am_i_admin()'), false);
      assert.equal(await one('select count(*)::int from shifts'), 1);
    });

    let calAna, calCar;
    await t.test('enlace general: dos parejas independientes crean su espacio; reintentos idempotentes', async () => {
      await as(ANA);
      calAna = await one('select start_mis_turnos()');
      assert.equal(await one('select start_mis_turnos()'), calAna, 'reintento: mismo espacio');
      const {rows:[c]} = await q('select name, kind, created_by from calendars');
      assert.deepEqual([c.name, c.kind, c.created_by], ['Turnos de Ana', 'shifts', ANA]);
      assert.equal(await one('select count(*)::int from usual_schedules'), 3);
      await as(CAR);
      calCar = await one('select start_mis_turnos()');
      assert.notEqual(calCar, calAna);
      assert.equal(await one('select display_name from people'), 'Carla Ruiz');
      await as(UNC); await assert.rejects(q('select start_mis_turnos()'), /Confirma/);
      await db.exec('reset role;');
      assert.equal(await one(`select count(*)::int from calendars where kind='shifts'`), 2);
    });

    let tokBru, tokDan;
    await t.test('invitar a la pareja: solo quien creó el espacio; reintentos y cambio de correo', async () => {
      await as(ANA);
      await assert.rejects(q(`select invite_partner('ana@test.es')`), /no el tuyo/);
      await assert.rejects(q(`select invite_partner('no-es-correo')`), /válido/);
      const t1 = await one(`select invite_partner('otro@test.es')`);
      tokBru = await one(`select invite_partner(' Bruno@Test.es ')`);
      assert.notEqual(t1, tokBru, 'otro correo: nueva invitación');
      assert.equal(await one(`select invite_partner('bruno@test.es')`), tokBru, 'reintento: misma invitación');
      assert.equal(await one('select email from my_invitation()'), 'bruno@test.es');
      await as(A); await assert.rejects(q(`select invite_partner('x@test.es')`), /creó el calendario/);
      await as(F); await assert.rejects(q(`select invite_partner('x@test.es')`), /creó el calendario/);
      await as(CAR); tokDan = await one(`select invite_partner('dani@test.es')`);
      await assert.rejects(q('select * from invitations'), /permission denied/);
      await db.exec('reset role; set role anon;');
      const info = (await q('select * from invitation_info($1)', [tokBru])).rows[0];
      assert.deepEqual([info.email, info.inviter_name, info.status], ['bruno@test.es', 'Ana', 'pending']);
      assert.equal((await q('select * from invitation_info($1)', [t1])).rows[0].status, 'revoked');
    });

    await t.test('aceptar: correo coincidente y confirmado, idempotente; cuenta nueva y cuenta con espacio vacío', async () => {
      await db.exec('reset role; set role anon;');
      await assert.rejects(q('select accept_invitation($1)', [tokBru]), /permission denied/);
      await as(INT); await assert.rejects(q('select accept_invitation($1)', [tokBru]), /otro correo/);
      await as(CAR); await assert.rejects(q('select accept_invitation($1)', [tokBru]), /otro correo/);
      await as(BRU);
      assert.equal(await one('select accept_invitation($1)', [tokBru]), calAna);
      assert.equal(await one('select accept_invitation($1)', [tokBru]), calAna, 'reintento');
      assert.equal(await one('select start_mis_turnos()'), calAna, 'el enlace general lo lleva a su calendario');
      assert.deepEqual((await q('select display_name from people order by sort_order')).rows.map(r => r.display_name), ['Ana', 'Bruno']);
      // Dani ya se había creado su propio espacio (vacío) por el enlace general: se une.
      await as(DAN);
      const own = await one('select start_mis_turnos()');
      assert.notEqual(own, calCar);
      assert.equal(await one('select accept_invitation($1)', [tokDan]), calCar);
      await db.exec('reset role;');
      assert.equal(await one(`select count(*)::int from calendars where id='${own}'`), 0, 'su espacio vacío se elimina');
      assert.equal(await one(`select display_name from people where user_id='${DAN}'`), 'Dani');
    });

    await t.test('máximo dos miembros y espacio con turnos protegido', async () => {
      await as(ANA);
      await assert.rejects(q(`select invite_partner('eva@test.es')`), /dos miembros/);
      await as(EVA);
      const evaCal = await one('select start_mis_turnos()');
      const evaP = await one('select id from people');
      await q(`insert into shifts(calendar_id,person_id,shift_date,kind,start_time,end_time) values ($1,$2,'2026-12-03','libre','00:00','00:00')`, [evaCal, evaP]);
      const fede = id(51);
      await db.exec(`reset role; insert into auth.users(id,email,email_confirmed_at) values ('${fede}','fede@test.es',now());`);
      await as(fede); await q('select start_mis_turnos()'); const tokEva = await one(`select invite_partner('eva@test.es')`);
      await as(EVA); await assert.rejects(q('select accept_invitation($1)', [tokEva]), /calendario con turnos/);
      assert.equal(await one('select count(*)::int from shifts'), 1, 'sus turnos siguen');
      await db.exec('reset role;');
      await assert.rejects(q(`insert into people(calendar_id,display_name,initial,color) values ($1,'X','X','#000000')`, [calAna]), /dos miembros/);
    });

    await t.test('turnos: cada uno los suyos, los dos ven todo, espacios aislados', async () => {
      await as(ANA);
      const ana = await one(`select id from people where user_id='${ANA}'`), bru = await one(`select id from people where user_id='${BRU}'`);
      const ins = (who, date, kind = 'libre', cal = calAna) => q(`insert into shifts(calendar_id,person_id,shift_date,kind,start_time,end_time) values ($1,$2,$3,$4,'06:00','14:00') returning id`, [cal, who, date, kind]);
      const {rows:[s]} = await ins(ana, '2026-12-05', 'manana');
      await q(`update shifts set kind='libre' where id=$1`, [s.id]);
      await assert.rejects(ins(bru, '2026-12-05'), /row-level security/);
      await as(BRU); await ins(bru, '2026-12-05');
      assert.equal((await q(`update shifts set kind='tarde' where person_id=$1 returning id`, [ana])).rows.length, 0, 'no edita los de Ana');
      assert.equal(await one('select count(*)::int from shifts'), 2);
      await as(CAR);
      assert.equal(await one('select count(*)::int from shifts'), 0);
      assert.equal(await one(`select count(*)::int from people where calendar_id='${calAna}'`), 0);
      assert.equal((await q(`delete from shifts where calendar_id='${calAna}' returning id`)).rows.length, 0);
      await assert.rejects(ins(ana, '2026-12-06', 'libre', calAna), /row-level security/);
      await as(F);
      assert.equal(await one(`select count(*)::int from shifts where calendar_id<>'${fam}'`), 0, 'el admin no ve turnos de parejas');
      await as(ANA);
      assert.equal(await one(`select count(*)::int from shifts where calendar_id='${fam}'`), 0);
      assert.equal(await one('select count(*)::int from calendars'), 1);
    });

    await t.test('invitados sin Tareas, Agenda ni Economía; la familia sigue igual', async () => {
      await as(ANA);
      await assert.rejects(q(`insert into tasks(calendar_id,title) values ($1,'x')`, [calAna]), /row-level security/);
      await assert.rejects(q(`insert into events(calendar_id,title,event_date) values ($1,'x','2026-12-01')`, [calAna]), /row-level security/);
      await assert.rejects(q(`insert into fin_recurring(calendar_id,section,concept,amount_cents,starts_on) values ($1,'fixed_expense','x',100,'2026-12-01')`, [calAna]), /row-level security/);
      await as(F); await q(`insert into tasks(calendar_id,title) values ('${fam}','Comprar pan')`);
      await as(A); assert.equal(await one('select count(*)::int from tasks'), 1);
    });

    await t.test('panel: solo el administrador; resumen sin correos; pausar el enlace general', async () => {
      await as(A);
      await assert.rejects(q('select * from admin_overview()'), /administrador/);
      await assert.rejects(q('select admin_set_general_signup(false)'), /administrador/);
      await as(F);
      const {rows} = await q('select * from admin_overview()');
      const ab = rows.find(r => r.calendar_id === calAna);
      assert.deepEqual(ab.members, ['Ana', 'Bruno']); assert.equal(ab.invitation_status, 'accepted');
      assert.ok(!JSON.stringify(rows).includes('@'), 'sin correos en el panel');
      assert.equal(await one('select admin_general_signup()'), true);
      await q('select admin_set_general_signup(false)');
      const nueva = id(61);
      await db.exec(`reset role; insert into auth.users(id,email,email_confirmed_at) values ('${nueva}','nueva@test.es',now());`);
      await as(nueva); await assert.rejects(q('select start_mis_turnos()'), /pausada/);
      await as(F); await q('select admin_set_general_signup(true)');
      await as(nueva); assert.ok(await one('select start_mis_turnos()'));
    });

    await t.test('hook de registro', async () => {
      const hook = async ev => { await db.exec('reset role; set role supabase_auth_admin;'); return one('select private.hook_before_user_created($1::jsonb)', [JSON.stringify(ev)]); };
      assert.deepEqual(await hook({user: {email: 'x@test.es', user_metadata: {signup_source: 'mis-turnos'}, app_metadata: {provider: 'email'}}}), {});
      assert.deepEqual(await hook({user: {email: 'g@test.es', user_metadata: {}, app_metadata: {provider: 'google'}}}), {});
      assert.equal((await hook({user: {email: 'y@test.es', user_metadata: {}, app_metadata: {provider: 'email'}}})).error.http_code, 403);
      await as(F); await q('select admin_set_general_signup(false)');
      assert.equal((await hook({user: {email: 'x@test.es', user_metadata: {signup_source: 'mis-turnos'}}})).error.http_code, 403);
      assert.deepEqual(await hook({user: {email: 'EVA@test.es', user_metadata: {}}}), {}, 'con invitación pendiente pasa aunque esté pausado');
      await as(F); await q('select admin_set_general_signup(true)');
      await as(A); await assert.rejects(q(`select private.hook_before_user_created('{}'::jsonb)`), /permission denied/);
    });
  } finally { await db.close(); }
});
