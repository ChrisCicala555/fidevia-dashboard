// An allowance summary on the Financial Summary tab.
//
// The by-contractor table had one allowance cell — "$42,000 of $50,000", with
// the rest of a multi-allowance contract on hover, which is not a summary and
// cannot be read on a phone or printed. An allowance is money the owner has
// already committed and is waiting to hear the fate of; the reconciliation
// Christopher described (60k allowance, 50k used, 10k deduct, "60k reduced
// down to 50k") has to read off the row without arithmetic.
//
// Run, not read: these figures must agree with the running totals elsewhere,
// and only evaluation proves that.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

const boot=(contractors, cos)=>{
  const P=bootPage(); P.run(SEED);
  P.run(`
    IS_ADMIN=true; EXTERNAL=false;
    currentProject.config.contractors=${JSON.stringify(contractors)};
    allData.co=${JSON.stringify(cos)};
  `);
  return P;
};
const CO=(o)=>Object.assign({'CO #':'','PCO #':'','Description':'','Company':'','Status':'Approved',
  'Cost Impact':'','Approved Amount':'','Allowance':'','Applied to Allowance':'','Allowance Splits':''}, o);

const GC=[{name:'Summit Builders',role:'GC',contract:'2000000',active:true,
  allowances:[{id:'A',name:'Floor leveler',amount:'60000'},{id:'B',name:'Hardware',amount:'20000'}]}];

console.log('The reconciliation Christopher described');
{
  // 60k allowance, 50k drawn, then a 10k deduct tied to it.
  const P=boot(GC,[
    CO({'CO #':'CO-001','Company':'Summit Builders','Description':'Leveling, north slab',
        'Approved Amount':'50000','Allowance Splits':JSON.stringify([{id:'A',amount:50000}])}),
    CO({'CO #':'CO-002','Company':'Summit Builders','Description':'Unused leveler credited back',
        'Approved Amount':'-10000','Allowance Splits':JSON.stringify([{id:'A',amount:10000}])})
  ]);
  const a=P.run(`allowanceSummaryFor('Summit Builders')[0]`);
  ok(a.original===60000, 'the original is what the contract set');
  ok(a.reduced===10000,  'the deduct writes the allowance down by its own value');
  ok(a.current===50000,  'so the allowance is now 50k — the sentence he wrote out');
  ok(a.used===50000,     'and 50k of it has been drawn');
  ok(a.left===0,         'leaving nothing, which is the point of crediting the remainder back');
  ok(P.run(`allowanceState(allowanceSummaryFor('Summit Builders')[0]).text`)==='Fully drawn',
     'and it reads as fully drawn rather than as a percentage');

  // The two figures must agree with what the rest of the dashboard computes.
  ok(a.left===P.run(`allowanceRemainingById('Summit Builders','A')`), 'remaining agrees with the running figure');
  ok(a.used===P.run(`allowanceUsedById('Summit Builders','A')`), 'and so does drawn');

  const act=a.activity;
  ok(act.length===2, 'both change orders are listed against the allowance');
  ok(act[0].kind==='drawn' && act[0].amount===50000, 'the positive one as a draw');
  ok(act[1].kind==='written off' && act[1].amount===10000, 'the deduct as a write-off, not a draw');
  ok(act[0].co==='CO-001' && /north slab/.test(act[0].desc), 'each naming the change order that did it');

  P.run(`renderAllowances()`);
  const rows=P.run(`document.getElementById('tbody-allowances').innerHTML`);
  ok(/Floor leveler/.test(rows), 'the panel names the allowance');
  ok(/CO-001/.test(rows) && /CO-002/.test(rows), 'and shows the change orders underneath it');
  ok(/now \$50,000/.test(rows), 'stating what the allowance is now, beside the write-down');
  ok(P.run(`document.getElementById('fin-allow-panel').style.display`)!=='none', 'and the panel is shown');
}

console.log('An untouched allowance, and one overdrawn');
{
  const P=boot(GC,[CO({'CO #':'CO-001','Company':'Summit Builders','Approved Amount':'70000',
    'Allowance Splits':JSON.stringify([{id:'A',amount:70000}])})]);
  const list=P.run(`allowanceSummaryFor('Summit Builders')`);
  const A=list[0], B=list[1];
  ok(A.left===-10000, 'drawing more than the allowance holds leaves it negative');
  ok(P.run(`allowanceState(allowanceSummaryFor('Summit Builders')[0]).text`)==='Overdrawn by $10,000',
     'said outright, with the figure, rather than shown as 117%');
  ok(P.run(`allowanceState(allowanceSummaryFor('Summit Builders')[0]).tone`)==='bad', 'and marked as a problem');
  ok(B.used===0 && B.left===20000, 'the second allowance is untouched');
  ok(P.run(`allowanceState(allowanceSummaryFor('Summit Builders')[1]).text`)==='Untouched',
     'and says so rather than "0% drawn"');
  P.run(`renderAllowances()`);
  const rows=P.run(`document.getElementById('tbody-allowances').innerHTML`);
  ok(/Overdrawn by/.test(rows), 'the panel carries the overdraw');
  ok(/Hardware/.test(rows), 'and lists every allowance on the contract, not only the ones in use');
  ok(/Total/.test(rows), 'with a total, since two allowances is where one cell stopped working');
}

console.log('A change order worth less than the allowance lines on it');
{
  // Two allowances named for 5k each on a change order worth 5k. Only 5k can
  // be drawn in total, so each line takes half — the same capping the running
  // totals apply. Listing them at face value would double-count the draw.
  const P=boot(GC,[CO({'CO #':'CO-001','Company':'Summit Builders','Description':'Split across two',
    'Approved Amount':'5000','Allowance Splits':JSON.stringify([{id:'A',amount:5000},{id:'B',amount:5000}])})]);
  const list=P.run(`allowanceSummaryFor('Summit Builders')`);
  ok(list[0].activity[0].amount===2500, 'each line is scaled to its share of what the change order is worth');
  ok(list[1].activity[0].amount===2500, 'on both allowances');
  ok(list[0].activity[0].amount+list[1].activity[0].amount===5000,
     'so the lines add up to the change order and not to twice it');
  ok(list[0].activity[0].amount===list[0].used, 'and each line agrees with the drawn figure above it');
}
{
  // A change order worth nothing draws nothing, whatever it names.
  const P=boot(GC,[CO({'CO #':'CO-001','Company':'Summit Builders','Approved Amount':'0',
    'Allowance Splits':JSON.stringify([{id:'A',amount:5000}])})]);
  ok(P.run(`allowanceSummaryFor('Summit Builders')[0].activity.length`)===0,
     'a change order that draws nothing is not listed as having drawn from the allowance');
}

console.log('What does not belong in it');
{
  // A proposal is not a draw; only an executed change order moves an allowance.
  const P=boot(GC,[CO({'PCO #':'PCO-001','CO #':'','Company':'Summit Builders','Approved Amount':'30000',
    'Allowance Splits':JSON.stringify([{id:'A',amount:30000}])})]);
  const a=P.run(`allowanceSummaryFor('Summit Builders')[0]`);
  ok(a.used===0, 'an approved proposal with no CO number has drawn nothing');
  ok(a.activity.length===0, 'and is not listed as activity against the allowance');
}
{
  // Another contract's change order must not reach this one's allowance.
  const two=[GC[0],{name:'Delaney Mechanical',role:'MC',contract:'500000',active:true,
    allowances:[{id:'A',name:'Controls',amount:'30000'}]}];
  const P=boot(two,[CO({'CO #':'CO-001','Company':'Delaney Mechanical','Approved Amount':'10000',
    'Allowance Splits':JSON.stringify([{id:'A',amount:10000}])})]);
  ok(P.run(`allowanceSummaryFor('Summit Builders')[0].used`)===0,
     "another contractor's draw on its own allowance A does not touch this one");
  ok(P.run(`allowanceSummaryFor('Delaney Mechanical')[0].used`)===10000, 'while its own is counted');
  ok(P.run(`allowanceSummaryFor('Summit Builders')[0].activity.length`)===0,
     "and its change order is not listed under this contract's allowance either");
  ok(P.run(`allowanceSummaryFor('Delaney Mechanical')[0].activity.length`)===1,
     'only under the contract it was issued against');
  P.run(`renderAllowances()`);
  const rows=P.run(`document.getElementById('tbody-allowances').innerHTML`);
  ok(/Summit Builders/.test(rows) && /Delaney Mechanical/.test(rows),
     'and the panel bands them by contract, since pooled allowance figures mean nothing');
}
{
  // A contract with no allowances should not produce an empty table — and the
  // rows of the contract looked at a moment ago must not still be sitting
  // there under a hidden panel, ready to reappear.
  const P=boot(GC,[CO({'CO #':'CO-001','Company':'Summit Builders','Approved Amount':'5000',
    'Allowance Splits':JSON.stringify([{id:'A',amount:5000}])})]);
  P.run(`renderAllowances()`);
  ok(/Floor leveler/.test(P.run(`document.getElementById('tbody-allowances').innerHTML`)), 'filled for a contract that has allowances');
  P.run(`currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'2000000',active:true}];
         renderAllowances();`);
  ok(P.run(`document.getElementById('fin-allow-panel').style.display`)==='none',
     'no allowances anywhere hides the panel rather than showing an empty one');
  ok(P.run(`document.getElementById('tbody-allowances').innerHTML`)==='',
     'and clears the rows, so switching project cannot leave another one\u2019s allowances behind');
}

console.log('Wiring');
ok(/id="tbody-allowances"/.test(html), 'the panel exists in the Financial Summary section');
{
  const i=html.indexOf('<div class="section" id="section-financials">');
  const j=html.indexOf('<!-- SCHEDULE -->', i);
  ok(html.slice(i,j).includes('id="fin-allow-panel"'), 'inside that section, not floating elsewhere');
}
{
  const f=html.slice(html.indexOf('function renderFinancials()'));
  ok(/renderAllowances\(\)/.test(f.slice(0, f.indexOf('\n// ── MANAGE CONTRACTORS'))),
     'and is redrawn whenever the financials are');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-allowpanel.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
