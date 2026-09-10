// Tying a change order to an allowance means two different things depending on
// the sign, and conflating them was my mistake in the commit before this one.
//
//   positive → DRAWS from the allowance. Spends it. The contract does not move
//              except for the excess above the draw.
//   negative → REDUCES the allowance. The $60,000 line becomes $50,000, and
//              that money leaves the contract.
//
// The second is how an allowance is reconciled at closeout (AIA A201 3.8.2.3):
// $60,000 allowed, $50,000 spent, a $10,000 deduct settles it. Blocking a
// deduct from touching an allowance blocked the ordinary case.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
P.run(`currentProject.config.contractors=[{name:'Summit Builders',contract:'2000000',active:true,
  allowances:[{id:'A',name:'Floor leveler',amount:'60000'},{id:'B',name:'Hardware',amount:'20000'}]}]`);
const CO = (amt,draw,id)=>({'Status':'Approved','Company':'Summit Builders','Approved Amount':String(amt),
  'Applied to Allowance':draw==null?'':String(draw),'Allowance':id||''});
const set = cos => P.run(`allData.co=${JSON.stringify(cos)}`);
const A = () => JSON.parse(P.run(`JSON.stringify(allowancesFor('Summit Builders').find(x=>x.id==='A'))`));
const used = id => P.run(`allowanceUsedById('Summit Builders','${id}')`);
const left = id => P.run(`allowanceRemainingById('Summit Builders','${id}')`);
const contract = () => P.run(`coContractImpactFor('Summit Builders')`);

console.log('Christopher’s case: 60k allowed, 50k spent, 10k written off');
set([CO(50000,50000,'A')]);
ok(A().amount===60000 && used('A')===50000 && left('A')===10000 && contract()===0,
   'spending 50k of it draws it down and leaves the contract alone');
set([CO(50000,50000,'A'), CO(-10000,null,'A')]);
{
  const a=A();
  ok(a.original===60000, 'the allowance the contract set is still on record');
  ok(a.reduced===10000, 'the write-off is recorded against it');
  ok(a.amount===50000, 'so the allowance now reads 50,000 — the reconciliation asked for');
  ok(used('A')===50000, 'the spend is unchanged by the write-off');
  ok(left('A')===0, 'and nothing remains to be drawn, which is the point of closing it out');
  ok(contract()===-10000, 'while the contract falls by the 10,000 returned to the owner');
}

console.log('The two operations stay apart');
set([CO(-10000,null,'A')]);
ok(P.run(`coAllowanceDraw(${JSON.stringify(CO(-10000,null,'A'))})`)===0,
   'a deduct draws nothing — it is not spending the allowance');
ok(A().amount===50000, 'it writes it down instead');
set([CO(8000,8000,'A')]);
ok(A().amount===60000 && A().reduced===0, 'while a positive one leaves the face amount alone');
ok(used('A')===8000, 'and draws against it');

console.log('Descoping, and other allowances');
set([CO(-60000,null,'A')]);
ok(A().amount===0 && contract()===-60000,
   'dropping the scope entirely removes the allowance and its money from the contract');
set([CO(-10000,null,'B')]);
ok(A().amount===60000, 'a deduct against B does not touch A');
ok(P.run(`allowancesFor('Summit Builders').find(x=>x.id==='B').amount`)===10000, 'it touches B');
set([CO(-10000,null,'')]);
ok(A().amount===60000 && A().reduced===0,
   'and a deduct tied to no allowance reduces none of them, rather than defaulting into A');
set([{'Status':'Open','Company':'Summit Builders','Approved Amount':'-10000','Allowance':'A'}]);
ok(A().amount===60000, 'an unapproved deduct writes nothing down until it is approved');

console.log('An allowance cannot be written below what is already spent');
set([CO(50000,50000,'A')]);
ok(P.run(`allowanceReducibleById('Summit Builders','A')`)===10000,
   'with 50k of 60k spent, only 10k can be written off');
set([CO(60000,60000,'A')]);
ok(P.run(`allowanceReducibleById('Summit Builders','A')`)===0, 'a fully spent allowance can be written off by nothing');
set([]);
ok(P.run(`allowanceReducibleById('Summit Builders','A')`)===60000, 'an untouched one, by all of it');
ok(P.run(`allowanceReducibleById('Summit Builders','ZZ')`)===0, 'and an allowance that does not exist, by nothing');
{
  const g = html.split('function coGenAllowNote(){')[1].split('\n}')[0];
  ok(/if\(cut>headroom\)/.test(g), 'the generator refuses to go further');
  ok(/would claim back money that is gone/.test(g), 'and says why in those terms');
  ok(/const before=\(a\?a\.amount:0\) \+ \(coAllowanceId\(r\)===id \? cut : 0\)/.test(g),
     'measuring against the allowance BEFORE this change order, so editing it does not appear to cut twice');
}

console.log('Never below zero');
set([CO(-90000,null,'A')]);
ok(A().amount===0, 'writing off more than the allowance holds floors it at nothing, not a negative allowance');

console.log('What the generator shows');
{
  const g = html.split('function coGenAllowNote(){')[1].split('\n}')[0];
  ok(/reduced from '\+fmtMoney\(before\)\+' to '\+fmtMoney\(before-cut\)/.test(g),
     'a deduct says what the allowance was and what it becomes');
  ok(/Choose an allowance if it is writing one down/.test(g),
     'a deduct with none chosen says it may want one, rather than silently being contract-only');
  ok(/if\(wrap\) wrap\.style\.display = coIsDeduct\(r\) \? 'none' : ''/.test(g),
     'the draw amount field is hidden on a deduct — the reduction is the change order’s own value, not a second number');
  ok(/if\(coIsDeduct\(r\) && amtEl\)\{ amtEl\.value=''; r\['Applied to Allowance'\]=''; \}/.test(g),
     'and any draw already recorded is cleared, so a row cannot both draw and reduce');
}
ok(/\(a\.reduced\?\(' \(reduced from '\+fmtMoney\(a\.original\)\+'\)'\):''\)/.test(html),
   'and the financial summary says an allowance was reduced rather than quietly showing a smaller number');

console.log('Legacy single-allowance contracts');
{
  P.run(`currentProject.config.contractors=[{name:'Old Co',contract:'500000',active:true,allowance:'25000'}]`);
  set([{'Status':'Approved','Company':'Old Co','Approved Amount':'-5000','Allowance':'A'}]);
  const a=JSON.parse(P.run(`JSON.stringify(allowancesFor('Old Co')[0])`));
  ok(a.legacy===true && a.original===25000 && a.amount===20000,
     'a contract from before named allowances is written down the same way');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-allowcut.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
