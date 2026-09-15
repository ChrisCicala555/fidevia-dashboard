// "Any way we could check the change order amount? If it doesn't match the
// change orders in a given month, the dashboard lets the user know."
//
// "Approved Change Orders" is typed off the paper G702, and the dashboard
// already knows the answer — it has every executed change order for that
// contract. Two numbers for one fact with nothing comparing them is how an
// application gets paid on a contract sum the log does not recognise.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
const CO=(o)=>Object.assign({'PCO #':'','CO #':'CO-GC-001','Company':'Summit Builders',
  'Status':'Approved','Approved Amount':'5000','Date Approved':'2026-08-10',
  'Allowance Splits':'','Rolled Into':''}, o);
const setCo=(a)=>P.run(`allData.co=${JSON.stringify(a)};`);
const row=(o)=>Object.assign({'Contractor':'Summit Builders','Period':'2026-09-01',
  'Approved Change Orders':'10000'}, o);
const check=(o)=>P.run(`payCoCheck(${JSON.stringify(row(o))})`);
const note=(o)=>String(P.run(`payCoCheckHTML(${JSON.stringify(row(o))})`)).replace(/<[^>]+>/g,'');

console.log('As at the period, not as at today');
{
  setCo([CO({'Approved Amount':'5000','Date Approved':'2026-08-10'}),
         CO({'CO #':'CO-GC-002','Approved Amount':'7000','Date Approved':'2026-10-02'})]);
  ok(P.run(`coNetAsOf('Summit Builders','2026-09-01')`)===5000,
     'a change order executed in October is not counted against a September application');
  ok(P.run(`coNetAsOf('Summit Builders','2026-10-01')`)===12000, 'and is counted from October');
  ok(P.run(`coNetAsOf('Summit Builders','')`)===12000, 'with no period, everything counts');
  // One executed on the last day of the period is inside it.
  setCo([CO({'Date Approved':'2026-09-30'})]);
  ok(P.run(`coNetAsOf('Summit Builders','2026-09-01')`)===5000,
     'the period runs to the end of its month, not to the first');
  setCo([CO({'Date Approved':'2026-10-01'})]);
  ok(P.run(`coNetAsOf('Summit Builders','2026-09-01')`)===0, 'and stops there');
}

console.log('Net in the same sense the Financial Summary means it');
{
  setCo([CO({'Approved Amount':'10000'}), CO({'CO #':'CO-GC-002','Approved Amount':'-4000'})]);
  ok(P.run(`coNetAsOf('Summit Builders','2026-09-01')`)===6000, 'a deduct reduces the net');
  setCo([CO({'Approved Amount':'10000','Allowance Splits':JSON.stringify([{id:'A',amount:10000}])})]);
  ok(P.run(`coNetAsOf('Summit Builders','2026-09-01')`)===0,
     'and a change order funded entirely from an allowance adds nothing — that money was in the contract already');
}
{
  setCo([CO({'CO #':'','PCO #':'PCO-GC-009','Status':'Approved','Approved Amount':'9000'})]);
  ok(P.run(`coNetAsOf('Summit Builders','2026-09-01')`)===0,
     'an approved proposal with no change order number is not executed, so it does not count');
  setCo([CO({'Company':'Delaney Mechanical'})]);
  ok(P.run(`coNetAsOf('Summit Builders','2026-09-01')`)===0, "and neither does another contract's");
}
{
  // A row with no approval date cannot be placed in time.
  setCo([CO({'Date Approved':'','Date Submitted':''})]);
  ok(P.run(`coNetAsOf('Summit Builders','2026-09-01')`)===5000,
     'an undated change order is counted rather than silently dropped, so the figure never understates');
}

console.log('What it says');
{
  setCo([CO({'Approved Amount':'5000'})]);
  const c=check();
  ok(c.typed===10000 && c.expected===5000 && c.diff===5000, 'the two figures and the gap');
  ok(c.agrees===false, 'and that they disagree');
  const t=note();
  ok(/\$5,000 more than the change order log/.test(t), 'it says which way and by how much');
  ok(/\$10,000 on the application, \$5,000 executed to date/.test(t), 'showing both figures');
  ok(/has not been recorded here/.test(t), 'and offers the two explanations, in that direction');
}
{
  setCo([CO({'Approved Amount':'15000'})]);
  const t=note();
  ok(/\$5,000 less than the change order log/.test(t), 'the other direction reads the other way');
  ok(/executed after this period/.test(t), 'with the explanations that fit it');
}
{
  setCo([CO({'Approved Amount':'10000'})]);
  ok(check().agrees===true, 'matching figures agree');
  ok(note()==='', 'and say nothing at all');
}
{
  setCo([CO({'Approved Amount':'10000.001'})]);
  ok(check().agrees===true,
     'a difference of a thousandth is the same figure written twice, not a discrepancy');
}
{
  setCo([]);
  ok(check({'Approved Change Orders':'0'}).agrees===true, 'nothing on either side agrees');
  ok(note({'Approved Change Orders':''})==='', 'and a blank field against no change orders says nothing');
  ok(!check({'Contractor':''}), 'an application with no contractor is not compared at all');
}

console.log('Where it appears');
{
  setCo([CO({'Approved Amount':'5000'})]);
  const short=String(P.run(`payCoCheckHTML(${JSON.stringify(row())},{short:true})`));
  ok(/\+\$5,000 vs change orders/.test(short.replace(/<[^>]+>/g,'')),
     'the log carries a short version — signed, so the direction is visible at a glance');
  ok(/cell-sub/.test(short), 'as a sub-line under the application number');
  ok(short.length < String(P.run(`payCoCheckHTML(${JSON.stringify(row())})`)).length,
     'shorter than the full explanation, which belongs in the dialog');
}
ok(/payCoCheckHTML\(r, \{short:true\}\)/.test(html), 'the pay app log runs the check on every row');
ok(/id="pa-cos-note"/.test(html), 'and the review dialog has somewhere to explain it');
ok(/oninput="payCoNote\(\)"/.test(html), 'answering as the figure is typed rather than after it is filed');
{
  const o=html.slice(html.indexOf('function payCoNote()'), html.indexOf('function payCoCheckHTML'));
  ok(/g\('pa-contr'\)/.test(o) && /g\('pa-period'\)/.test(o) && /g\('pa-cos'\)/.test(o),
     'reading the dialog rather than the saved row, so it follows what is on screen');
  ok(/saved\['Contractor'\]/.test(o),
     'falling back to the saved row for fields the dialog does not show');
}
ok(/if\(pd\) pd\.onchange=payCoNote;/.test(html),
   'and it is redone when the period changes, since the comparison depends on it');

console.log((bad?'FAIL':'ok  ')+' tools-test-pacocheck.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
