const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');

test('migraciones, RLS, noches, horario de verano y conflictos', async t => {
  const db = new PGlite();
  const f='00000000-0000-0000-0000-000000000001', a='00000000-0000-0000-0000-000000000002', x='00000000-0000-0000-0000-000000000003';
  const cal='10000000-0000-0000-0000-000000000001', other='10000000-0000-0000-0000-000000000002';
  const person='20000000-0000-0000-0000-000000000001', partner='20000000-0000-0000-0000-000000000002', stranger='20000000-0000-0000-0000-000000000003';
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
    await db.exec(`insert into public.calendars(id,name) values ('${cal}','Pareja'),('${other}','Otro');
      insert into public.people(id,calendar_id,display_name,initial,color,user_id) values
      ('${person}','${cal}','Franklin','F','#2563EB','${f}'),
      ('${partner}','${cal}','Almudena','A','#C2410C','${a}'),
      ('${stranger}','${other}','Ajeno','X','#15803D','${x}');
      insert into shifts(calendar_id,person_id,shift_date,kind,start_time,end_time,version,created_by,updated_by) values ('${cal}','${person}','2026-01-01','manana','06:00','14:00',7,'${f}','${a}');`);
    for (const file of migrations.slice(1)) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${f}';`);
    await t.test('migración conserva datos anteriores, versión y autoría', async () => {
      const {rows:[legacy]} = await db.query("select * from shifts where shift_date='2026-01-01'");
      assert.equal(legacy.version,7); assert.equal(legacy.created_by,f); assert.equal(legacy.updated_by,a);
      assert.equal(new Date(legacy.start_at).toISOString(),'2026-01-01T05:00:00.000Z');
    });
    const insert = (date, kind, start, end, who=person, group=cal) => db.query('insert into shifts(calendar_id,person_id,shift_date,kind,start_time,end_time) values ($1,$2,$3,$4,$5,$6) returning *',[group,who,date,kind,start,end]);
    await t.test('noche normal y edición del turno propio', async () => {
      const {rows:[s]}=await insert('2026-11-16','noche','22:00','06:00');
      assert.equal(new Date(s.end_at)-new Date(s.start_at),8*3600000);
      await db.query("update shifts set end_time='07:00' where id=$1",[s.id]);
      const {rows:[updated]}=await db.query('select version from shifts where id=$1',[s.id]);assert.equal(updated.version,2);
    });
    await t.test('cinco días de una operación y protección de duplicados',async()=>{
      const {rows}=await db.query(`insert into shifts(calendar_id,person_id,shift_date,kind,start_time,end_time) select $1,$2,d::date,'manana','06:00','14:00' from generate_series('2026-11-20'::date,'2026-11-24'::date,'1 day') d returning id`,[cal,person]); assert.equal(rows.length,5);
      await assert.rejects(insert('2026-11-20','manana','06:00','14:00'));
      const repeated = await db.query("insert into shifts(calendar_id,person_id,shift_date,kind,start_time,end_time) values ($1,$2,'2026-11-20','tarde','14:00','22:00') on conflict (person_id,shift_date) do nothing returning id",[cal,person]);
      assert.equal(repeated.rows.length,0);
      const unchanged = await db.query("select kind from shifts where person_id=$1 and shift_date='2026-11-20'",[person]);assert.equal(unchanged.rows[0].kind,'manana');
    });
    await t.test('cambio de hora: noche de 7 y de 9 horas',async()=>{
      for(const [date,hours] of [['2026-03-28',7],['2026-10-24',9]]){const {rows:[s]}=await insert(date,'noche','22:00','06:00');assert.equal(new Date(s.end_at)-new Date(s.start_at),hours*3600000);}
      await assert.rejects(insert('2026-03-29','manana','02:30','08:00'),/Hora inexistente/);
    });
    await t.test('día completo sin horas y rechazo de solapamientos',async()=>{
      const {rows:[s]}=await insert('2026-03-29','libre','00:00','00:00');assert.equal(new Date(s.end_at)-new Date(s.start_at),23*3600000);
      await assert.rejects(insert('2026-11-17','manana','06:00','14:00'),/solapa/);
    });
    await t.test('la pareja ve los turnos pero no puede cambiarlos; versiones obsoletas no se borran',async()=>{
      const {rows:[shift]}=await db.query("select * from shifts where shift_date='2026-11-20'");
      const stale=await db.query('delete from shifts where id=$1 and version=$2 returning id',[shift.id,shift.version+1]);assert.equal(stale.rows.length,0);
      const changed=await db.query("update shifts set end_time='15:00' where id=$1 and version=$2 returning version",[shift.id,shift.version]);assert.equal(changed.rows[0].version,shift.version+1);
      await db.exec(`set request.jwt.claim.sub='${a}';`);
      const {rows:[seen]}=await db.query("select * from shifts where shift_date='2026-11-20'");
      assert.equal(seen.person_id,person);
      const u=await db.query("update shifts set end_time='16:00' where id=$1 returning id",[seen.id]);assert.equal(u.rows.length,0);
      const d=await db.query('delete from shifts where id=$1 returning id',[seen.id]);assert.equal(d.rows.length,0);
      await assert.rejects(insert('2026-12-01','manana','06:00','14:00',person),/row-level security/);
      await db.exec(`set request.jwt.claim.sub='${f}';`);
      await assert.rejects(insert('2026-12-01','manana','08:00','15:00',partner),/row-level security/);
    });
    await t.test('Almudena: sus turnos, solo M/T/Libre/Vacaciones y horario habitual',async()=>{
      const {rows:sch}=await db.query("select kind::text, start_time::text, end_time::text from usual_schedules where person_id=$1 order by kind",[partner]);
      assert.deepEqual(sch,[{kind:'manana',start_time:'08:00:00',end_time:'15:00:00'},{kind:'tarde',start_time:'15:00:00',end_time:'22:00:00'}]);
      await db.exec(`set request.jwt.claim.sub='${a}';`);
      const {rows:[m]}=await insert('2026-12-02','manana','08:00','15:00',partner);
      await db.query("update shifts set kind='tarde', start_time='15:00', end_time='22:00' where id=$1",[m.id]);
      await insert('2026-12-03','vacaciones','00:00','00:00',partner);
      await assert.rejects(insert('2026-12-04','noche','22:00','06:00',partner),/no permitido/);
      await assert.rejects(db.query("update shifts set kind='noche', start_time='22:00', end_time='06:00' where id=$1",[m.id]),/no permitido/);
      const del=await db.query('delete from shifts where id=$1 returning id',[m.id]);assert.equal(del.rows.length,1);
      await db.exec(`set request.jwt.claim.sub='${f}';`);
    });
    await t.test('turnos con nombre: plantillas propias, tipo permitido y etiqueta en el turno',async()=>{
      const tpl=(who,name,kind,s,e)=>db.query('insert into shift_templates(person_id,name,kind,start_time,end_time) values ($1,$2,$3,$4,$5) returning *',[who,name,kind,s,e]);
      const {rows:[p]}=await tpl(person,'Partido','manana','09:00','13:00');
      await assert.rejects(tpl(person,' partido ','tarde','15:00','19:00'),/duplicate|unique/);
      await assert.rejects(tpl(person,'Libre largo','libre','09:00','13:00'),/check/);
      await assert.rejects(tpl(partner,'Ajena','manana','09:00','13:00'),/row-level security/);
      const {rows:[sh]}=await db.query("insert into shifts(calendar_id,person_id,shift_date,kind,start_time,end_time,label) values ($1,$2,'2026-12-10','manana','09:00','13:00','Partido') returning label",[cal,person]);
      assert.equal(sh.label,'Partido');
      await db.query("update shift_templates set name='Partido corto' where id=$1",[p.id]);
      const {rows:[still]}=await db.query("select label from shifts where person_id=$1 and shift_date='2026-12-10'",[person]);assert.equal(still.label,'Partido');
      await db.exec(`set request.jwt.claim.sub='${a}';`);
      const seen=await db.query('select * from shift_templates');assert.equal(seen.rows.length,0);
      await assert.rejects(tpl(partner,'Noche extra','noche','22:00','06:00'),/no permitido/);
      const {rows:[mine]}=await tpl(partner,'Media mañana','manana','10:00','14:00');assert.ok(mine.id);
      const u=await db.query("update shift_templates set name='x' where id=$1 returning id",[p.id]);assert.equal(u.rows.length,0);
      await db.exec(`set request.jwt.claim.sub='${f}';`);
      const d=await db.query('delete from shift_templates where id=$1 returning id',[p.id]);assert.equal(d.rows.length,1);
    });
    await t.test('RLS: sin lecturas ni escrituras en otro grupo',async()=>{
      const {rows}=await db.query('select * from people');assert.equal(rows.length,2);
      await assert.rejects(insert('2026-11-20','manana','06:00','14:00',stranger,other),/row-level security/);
      await assert.rejects(db.query('update people set user_id=$1 where id=$2',[x,person]),/permission denied/);
      await db.query("update people set color='#15803D' where id=$1",[partner]);
      await db.exec(`set request.jwt.claim.sub='${x}';`);
      const r=await db.query('select * from shifts');assert.equal(r.rows.length,0);
      const u=await db.query("update shifts set end_time='18:00' returning id");assert.equal(u.rows.length,0);
      const d=await db.query('delete from shifts returning id');assert.equal(d.rows.length,0);
      await db.exec('set role anon;');await assert.rejects(db.query('select * from shifts'),/permission denied/);
    });
  } finally {await db.close();}
});
