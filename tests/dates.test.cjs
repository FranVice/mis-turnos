const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const fs=require('node:fs');
const output=ts.transpileModule(fs.readFileSync('src/lib/dates.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const domain={};new Function('exports',output)(domain);
test('calendario lunes primero, bisiesto y cambios de mes',()=>{
 assert.equal(domain.weekdayIndex('2026-11-16'),0);
 assert.equal(domain.addDays('2024-02-28',1),'2024-02-29');
 assert.deepEqual(domain.shiftMonth({year:2026,month:1},-1),{year:2025,month:12});
 for(let m=1;m<=12;m++){const w=domain.monthWeeks({year:2026,month:m});assert.ok(w.every(row=>row.length===7));assert.equal(w.flat().filter(Boolean).length,new Date(Date.UTC(2026,m,0)).getUTCDate());}
 assert.equal(domain.endsNextDay('22:00','06:00'),true);assert.equal(domain.isValidTime('24:00'),false);
});
