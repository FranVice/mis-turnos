const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');

// Espacios de pareja: alta desde el panel, invitaciones, aislamiento y
// límite «solo Mis Turnos» para los invitados (en la base de datos).
test('espacios de pareja: invitaciones, aislamiento y módulos familiares', async t => {
  const db = new PGlite();
  const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
  const F = id(1), A = id(2);                 // Franklin y Almudena
  const P1a = id(11), P1b = id(12);           // pareja 1
  const P2a = id(21), P2b = id(22);           // pareja 2
  const WRONG = id(31), UNCONF = id(32);      // otro correo / sin confirmar
  const fam = '10000000-0000-0000-0000-000000000001';
  const pf = '20000000-0000-0000-0000-000000000001', pa = '20000000-0000-0000-0000-000000000002';
  const as = async uid => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${uid}';`);
  const rpc = (sql, params = []) => db.query(sql, params);
  try {
    await db.exec(`create role anon; create role authenticated; create role supabase_auth_admin; create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
      create publication supabase_realtime;
      alter default privileges in schema public grant all on tables to anon, authenticated;
      insert into auth.users values
        ('${F}','franklin@test.es',now()),('${A}','almudena@test.es',now()),
        ('${P1a}','ana@test.es',now()),('${P1b}','bruno@test.es',now()),
        ('${P2a}','carla@test.es',now()),('${P2b}','dani@test.es',now()),
        ('${WRONG}','intruso@test.es',now()),('${UNCONF}','sinconfirmar@test.es',null);`);
    const migrations = fs.readdirSync('supabase/migrations').sort();
    await db.exec(fs.readFileSync('supabase/migrations/' + migrations[0], 'utf8'));
    await db.exec(`insert into public.calendars(id,name) values ('${fam}','Familia');
      insert into public.people(id,calendar_id,display_name,initial,color,user_id) values
      ('${pf}','${fam}','Franklin','F','#2563EB','${F}'),('${pa}','${fam}','Almudena','A','#C2410C','${A}');
      insert into shifts(calendar_id,person_id,shift_date,kind,start_time,end_time,created_by,updated_by)
      values ('${fam}','${pf}','2026-12-01','manana','06:00','14:00','${F}','${F}');`);
    for (const file of migrations.slice(1)) await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));

    let cal1, cal2;
    await t.test('el espacio actual pasa a familiar y Franklin es administrador', async () => {
      const {rows:[c]} = await rpc(`select kind from calendars where id='${fam}'`);
      assert.equal(c.kind, 'family');
      await as(F); assert.equal((await rpc('select am_i_admin() a')).rows[0].a, true);
      await as(A); assert.equal((await rpc('select am_i_admin() a')).rows[0].a, false);
      const {rows} = await rpc('select * from shifts'); assert.equal(rows.length, 1);
    });

    await t.test('solo Franklin da de alta parejas; validaciones', async () => {
      await as(A);
      await assert.rejects(rpc(`select admin_create_couple('X','Ana','ana@test.es','Bruno','bruno@test.es')`), /administrador/);
      await assert.rejects(rpc('select * from admin_list_invitations()'), /administrador/);
      await as(P1a);
      await assert.rejects(rpc(`select admin_create_couple('X','Ana','ana@test.es','Bruno','bruno@test.es')`), /administrador/);
      await as(F);
      await assert.rejects(rpc(`select admin_create_couple('X','Ana','ana@test.es','Bruno','ANA@test.es')`), /distintos/);
      await assert.rejects(rpc(`select admin_create_couple('X','Ana','almudena@test.es','Bruno','bruno@test.es')`), /pertenece/);
      cal1 = (await rpc(`select admin_create_couple('Ana y Bruno','Ana',' Ana@Test.es ','Bruno','bruno@test.es') id`)).rows[0].id;
      cal2 = (await rpc(`select admin_create_couple('','Carla','carla@test.es','Dani','dani@test.es') id`)).rows[0].id;
      await assert.rejects(rpc(`select admin_create_couple('X','Otra','ana@test.es','Más','mas@test.es')`), /invitación/);
      const {rows} = await rpc('select * from admin_list_invitations()');
      assert.equal(rows.length, 4);
      assert.ok(rows.every(r => r.status === 'pending'));
      assert.deepEqual(rows.filter(r => r.calendar_id === cal1).map(r => r.email).sort(), ['ana@test.es', 'bruno@test.es']);
      assert.equal(rows.find(r => r.calendar_id === cal2).space_name, 'Carla y Dani');
      // El administrador no ve los turnos ni las personas de las parejas por ser admin.
      const people = await rpc('select * from people'); assert.equal(people.rows.length, 2);
      // Las invitaciones no son accesibles directamente por la API.
      await assert.rejects(rpc('select * from invitations'), /permission denied/);
    });

    const tokenOf = async email => { await as(F); return (await rpc('select token from admin_list_invitations() where email=$1', [email])).rows[0].token; };

    await t.test('hook de registro: solo correos con invitación pendiente', async () => {
      await db.exec('reset role; set role supabase_auth_admin;');
      const ok = (await rpc(`select private.hook_before_user_created('{"user":{"email":"Ana@TEST.es"}}'::jsonb) r`)).rows[0].r;
      assert.deepEqual(ok, {});
      const no = (await rpc(`select private.hook_before_user_created('{"user":{"email":"nadie@test.es"}}'::jsonb) r`)).rows[0].r;
      assert.equal(no.error.http_code, 403);
      await as(A);
      await assert.rejects(rpc(`select private.hook_before_user_created('{}'::jsonb)`), /permission denied/);
    });

    await t.test('aceptación: correo coincidente, confirmado e idempotente', async () => {
      const tAna = await tokenOf('ana@test.es'), tBruno = await tokenOf('bruno@test.es');
      await db.exec('reset role; set role anon;');
      const info = (await rpc('select * from invitation_info($1)', [tAna])).rows[0];
      assert.equal(info.email, 'ana@test.es'); assert.equal(info.space_name, 'Ana y Bruno');
      await assert.rejects(rpc('select accept_invitation($1)', [tAna]), /permission denied/);
      await as(WRONG); await assert.rejects(rpc('select accept_invitation($1)', [tAna]), /otro correo/);
      await as(P1b); await assert.rejects(rpc('select accept_invitation($1)', [tAna]), /otro correo/);
      await as(A); await assert.rejects(rpc('select accept_invitation($1)', [tAna]), /otro correo/);
      await as(P1a);
      assert.equal((await rpc('select accept_invitation($1) c', [tAna])).rows[0].c, cal1);
      assert.equal((await rpc('select accept_invitation($1) c', [tAna])).rows[0].c, cal1); // repetida
      await as(P1b); await rpc('select accept_invitation($1)', [tBruno]);
      for (const e of ['carla@test.es', 'dani@test.es']) { const tk = await tokenOf(e); await as(e === 'carla@test.es' ? P2a : P2b); await rpc('select accept_invitation($1)', [tk]); }
      await as(F);
      const {rows} = await rpc('select email, status from admin_list_invitations()');
      assert.ok(rows.every(r => r.status === 'accepted'));
      await db.exec('reset role;');
      const {rows:[c]} = await rpc(`select count(*)::int n from people where calendar_id='${cal1}' and user_id is not null`);
      assert.equal(c.n, 2);
    });

    await t.test('correo sin confirmar y anulación/reinvitación', async () => {
      await as(F);
      const cal3 = (await rpc(`select admin_create_couple('Tres','Eva','sinconfirmar@test.es','Fede','fede@test.es') id`)).rows[0].id;
      const tEva = await tokenOf('sinconfirmar@test.es');
      await as(UNCONF); await assert.rejects(rpc('select accept_invitation($1)', [tEva]), /Confirma/);
      await as(F);
      const {rows:[fede]} = await rpc(`select id from admin_list_invitations() where email='fede@test.es'`);
      await rpc('select admin_revoke_invitation($1)', [fede.id]);
      await assert.rejects(rpc('select admin_revoke_invitation($1)', [fede.id]), /pendiente/);
      assert.ok(cal3);
      const tok = (await rpc('select admin_reinvite($1,$2) t', [fede.id, 'fede2@test.es'])).rows[0].t;
      assert.ok(tok);
      await assert.rejects(rpc('select admin_reinvite($1,$2)', [fede.id, 'otro@test.es']), /pendiente/);
      const {rows:[ana]} = await rpc(`select id from admin_list_invitations() where email='ana@test.es'`);
      await assert.rejects(rpc('select admin_reinvite($1,$2)', [ana.id, 'x@test.es']), /no encontrada/);
      await as(A);
      await assert.rejects(rpc('select admin_reinvite($1,$2)', [fede.id, 'y@test.es']), /administrador/);
    });

    await t.test('cada pareja gestiona sus turnos y no ve los de otros espacios', async () => {
      await as(P1a);
      const {rows:mine} = await rpc('select id, display_name from people order by sort_order');
      assert.deepEqual(mine.map(r => r.display_name), ['Ana', 'Bruno']);
      const ana = mine[0].id, bruno = mine[1].id;
      const {rows:sch} = await rpc('select count(*)::int n from usual_schedules');
      assert.equal(sch[0].n, 6);
      const ins = (who, date, kind = 'libre') => rpc(`insert into shifts(calendar_id,person_id,shift_date,kind,start_time,end_time) values ($1,$2,$3,$4,'06:00','14:00') returning *`, [cal1, who, date, kind]);
      const {rows:[s]} = await ins(ana, '2026-12-05', 'manana');
      await rpc(`update shifts set kind='libre' where id=$1`, [s.id]);
      await assert.rejects(ins(bruno, '2026-12-05'), /row-level security/); // regla actual: cada uno los suyos
      await as(P1b); await ins(bruno, '2026-12-05');
      const {rows:seen} = await rpc('select person_id from shifts'); assert.equal(seen.length, 2);
      // Pareja 2 y familia: no ven nada de la pareja 1, ni al revés.
      await as(P2a);
      assert.equal((await rpc('select * from shifts')).rows.length, 0);
      assert.equal((await rpc(`select * from people where calendar_id='${cal1}'`)).rows.length, 0);
      assert.equal((await rpc(`update shifts set kind='tarde' where calendar_id='${cal1}' returning id`)).rows.length, 0);
      assert.equal((await rpc(`delete from shifts where calendar_id='${cal1}' returning id`)).rows.length, 0);
      await assert.rejects(rpc(`insert into shifts(calendar_id,person_id,shift_date,kind,start_time,end_time) values ($1,$2,'2026-12-06','libre','00:00','00:00')`, [cal1, ana]), /row-level security/);
      await as(F);
      const fam = await rpc('select calendar_id from shifts'); assert.ok(fam.rows.every(r => r.calendar_id === '10000000-0000-0000-0000-000000000001'));
      await as(P1a);
      assert.equal((await rpc(`select * from shifts where calendar_id='${fam.rows[0].calendar_id}'`)).rows.length, 0);
      assert.equal((await rpc('select * from calendars')).rows.length, 1);
    });

    await t.test('invitados: sin Tareas, Agenda ni Economía; la familia sigue igual', async () => {
      await as(P1a);
      await assert.rejects(rpc(`insert into tasks(calendar_id,title) values ($1,'x')`, [cal1]), /row-level security/);
      await assert.rejects(rpc(`insert into events(calendar_id,title,event_date) values ($1,'x','2026-12-01')`, [cal1]), /row-level security/);
      await assert.rejects(rpc(`insert into fin_recurring(calendar_id,section,concept,amount_cents,starts_on) values ($1,'fixed_expense','x',100,'2026-12-01')`, [cal1]), /row-level security/);
      assert.equal((await rpc('select * from tasks')).rows.length, 0);
      await as(F);
      const {rows:[task]} = await rpc(`insert into tasks(calendar_id,title) values ('${fam}','Comprar pan') returning id`);
      assert.ok(task.id);
      await rpc(`insert into events(calendar_id,title,event_date) values ('${fam}','Médico','2026-12-02')`);
      await as(A);
      assert.equal((await rpc('select * from tasks')).rows.length, 1);
      assert.equal((await rpc('select * from events')).rows.length, 1);
    });
  } finally { await db.close(); }
});
