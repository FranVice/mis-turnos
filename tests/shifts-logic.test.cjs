const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const fs=require('node:fs');
const output=ts.transpileModule(fs.readFileSync('src/modules/shifts/logic.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const L={};new Function('exports',output)(L);
const both=['f','a'];
const s=(personId,kind)=>({personId,kind});

test('día libre en común', ()=>{
  assert.equal(L.isSharedFreeDay([s('f','libre'),s('a','libre')],both),true, 'los dos libres');
  assert.equal(L.isSharedFreeDay([s('f','libre'),s('a','manana')],both),false,'solo uno libre');
  assert.equal(L.isSharedFreeDay([s('f','libre')],both),false,'falta el turno del otro');
  assert.equal(L.isSharedFreeDay([s('f','libre'),s('a','vacaciones')],both),false,'vacaciones no cuenta');
  assert.equal(L.isSharedFreeDay(undefined,both),false,'sin turnos');
  assert.equal(L.isSharedFreeDay([s('f','libre')],['f']),false,'espacio de una sola persona');
  assert.equal(L.isSharedFreeDay([s('f','libre'),s('f','libre')],both),false,'no cuenta dos veces a la misma persona');
  // Editar o borrar: el cálculo sale de la lista actual de turnos.
  const day=[s('f','libre'),s('a','libre')];
  assert.equal(L.isSharedFreeDay(day.filter(x=>x.personId!=='a'),both),false,'tras borrar uno');
  assert.equal(L.isSharedFreeDay([day[0],{...day[1],kind:'tarde'}],both),false,'tras editar uno');
});
