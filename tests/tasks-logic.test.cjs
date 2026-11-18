const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const fs=require('node:fs');
const output=ts.transpileModule(fs.readFileSync('src/modules/tasks/logic.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const L={};new Function('exports',output)(L);
const T='2026-11-18';
const task=(id,dueDate=null,assigneeId=null,doneAt=null)=>({id,title:id,dueDate,assigneeId,doneAt});

test('tareas: secciones, orden y filtros',()=>{
  assert.equal(L.bucketOf(task('a','2026-11-17'),T),'overdue');
  assert.equal(L.bucketOf(task('a',T),T),'today');
  assert.equal(L.bucketOf(task('a','2026-12-01'),T),'upcoming');
  assert.equal(L.bucketOf(task('a'),T),'nodate');

  const list=[task('sin'),task('prox2','2026-11-25'),task('hoy',T),task('prox1','2026-11-20'),task('vencida','2026-11-01'),task('hecha','2026-11-01',null,'2026-11-18T10:00:00Z')];
  const groups=L.groupPending(list,T);
  assert.deepEqual(groups.map(g=>g.bucket),['overdue','today','upcoming','nodate']);
  assert.deepEqual(groups[2].tasks.map(t=>t.id),['prox1','prox2']);
  assert.ok(!groups.flatMap(g=>g.tasks).some(t=>t.id==='hecha'));
  assert.deepEqual(L.topPending(list,T,3).map(t=>t.id),['vencida','hoy','prox1']);

  const me='p1';
  assert.equal(L.matchesFilter(task('a',null,null),'mine',me),true);   // de los dos
  assert.equal(L.matchesFilter(task('a',null,'p1'),'mine',me),true);
  assert.equal(L.matchesFilter(task('a',null,'p2'),'mine',me),false);
  assert.equal(L.matchesFilter(task('a',null,'p1','x'),'mine',me),false); // hecha no sale en Mías
  assert.equal(L.matchesFilter(task('a',null,'p2','x'),'done',me),true);
  assert.equal(L.matchesFilter(task('a'),'done',me),false);
});
