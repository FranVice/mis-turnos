const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const fs=require('node:fs');
const output=ts.transpileModule(fs.readFileSync('src/modules/finances/logic.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const L={};new Function('exports',output)(L);

test('economía: lectura de importes en formato español',()=>{
  const cases={'12':1200,'12,5':1250,'12,50':1250,'1.234,56':123456,'1234.56':123456,'1,234.56':123456,'1.234':123400,'€ 45':4500,'0,99':99,' 7 ':700};
  for(const [text,cents] of Object.entries(cases)) assert.equal(L.parseEuros(text),cents,text);
  for(const bad of ['','0','0,00','-5','abc','12,345','1,2,3','12.5.6']) assert.equal(L.parseEuros(bad),null,bad);
});

test('economía: formato de importes',()=>{
  assert.equal(L.formatEuros(123456),'1.234,56 €');
  assert.equal(L.formatEuros(5),'0,05 €');
  assert.equal(L.formatEuros(-250000),'−2.500,00 €');
  assert.equal(L.formatEuros(1500,{sign:true}),'+15,00 €');
  assert.equal(L.formatEuros(123456,{decimals:false}),'1.234 €');
  assert.equal(L.centsToInput(123456),'1234,56');
  assert.equal(L.parseEuros(L.centsToInput(7005)),7005);
});

test('economía: resumen del mes (previsto, hecho, omitido)',()=>{
  const m=(section,amountCents,status)=>({section,amountCents,status});
  const s=L.summarize([
    m('fixed_income',165000,'done'),m('fixed_income',148000,'planned'),m('extra_income',4000,'done'),
    m('fixed_expense',62000,'done'),m('fixed_expense',7500,'planned'),m('fixed_expense',9900,'skipped'),
    m('variable_expense',8530,'done'),
  ]);
  assert.equal(s.incomeDone,169000); assert.equal(s.incomeTotal,317000);
  assert.equal(s.expenseDone,70530); assert.equal(s.expenseTotal,78030);
  assert.equal(s.balanceDone,98470); assert.equal(s.forecast,238970);
  assert.equal(s.pendingIncome,148000); assert.equal(s.pendingExpense,7500);
  assert.equal(s.sections.fixed_expense.count,2); // el omitido no cuenta
  assert.equal(L.monthKey(2026,3),'2026-03-01');
});
