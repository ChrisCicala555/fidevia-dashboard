// Choosing an allowance from a list that only names it is choosing blind — the
// figure you need to decide with is what is left in it, and that was two
// clicks away in the Financial Summary.
//
// Also: the section heading said ALLOWANCE and the column header directly
// beneath it said ALLOWANCE again.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
// Fixture rows carry a CO number now: an approved row WITHOUT one is a
// proposal, and proposals no longer move the contract. The arithmetic under
// test is unchanged; only which rows take part in it.
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);
R(`currentProject.config.contractors=[{name:'Summit Builders',contract:'2000000',active:true,
  allowances:[{id:'A',name:'Materials',amount:'50000'},{id:'B',name:'Hardware',amount:'20000'},{id:'C',amount:'15000'}]}];`);
const label = js => R(`allowOptionLabel(${js})`);

console.log('What an option says');
ok(label(`{id:'A',name:'Materials',amount:50000,left:50000}`)==='Allowance A — Materials  ·  $50,000',
   'an untouched allowance shows its amount, plainly');
ok(label(`{id:'A',name:'Materials',amount:50000,left:42000}`)
   ==='Allowance A — Materials  ·  $42,000 left of $50,000',
   'and once some is spent, what is left and what it was');
ok(label(`{id:'C',amount:15000,left:15000}`)==='Allowance C  ·  $15,000',
   'an unnamed one is just its letter, with no dangling dash');
ok(label(`{id:'A',name:'Materials',amount:50000}`)==='Allowance A — Materials  ·  $50,000',
   'and with nothing known about spending, the amount stands alone rather than reading as a remainder');
ok(label(`{id:'B',name:'Hardware',amount:20000,left:0}`)
   ==='Allowance B — Hardware  ·  $0 left of $20,000',
   'a fully spent one says so rather than hiding the zero');

console.log('Where the figure comes from');
{
  R(`allData.co=[{'CO #':'CO-X','Status':'Approved','Company':'Summit Builders','Approved Amount':'8000',
      'Allowance Splits':JSON.stringify([{id:'A',amount:8000}])}]`);
  const list=JSON.parse(R(`JSON.stringify(allowancesFor('Summit Builders').map(a=>
    allowOptionLabel(Object.assign({},a,{left:allowanceRemainingById('Summit Builders',a.id)}))))`));
  ok(/\$42,000 left of \$50,000/.test(list[0]), 'a draw against A shows in A');
  ok(!/left of/.test(list[1]), 'and not in B, which nobody has touched');
}
{
  // An allowance written down reads at its CURRENT amount. It is not "left of"
  // the original, because the original is no longer owed.
  R(`allData.co=[{'CO #':'CO-X','Status':'Approved','Company':'Summit Builders','Approved Amount':'-5000',
      'Allowance Splits':JSON.stringify([{id:'B',amount:5000}])}]`);
  const b=R(`(function(){const a=allowancesFor('Summit Builders').find(x=>x.id==='B');
    return allowOptionLabel(Object.assign({},a,{left:allowanceRemainingById('Summit Builders','B')}));})()`);
  ok(b==='Allowance B — Hardware  ·  $15,000',
     'a written-down allowance offers what it is now worth, with nothing spent against it');
  R(`allData.co=[]`);
}
{
  const f = html.split('function coGenAllowFill(idx){')[1].split('\n}')[0];
  ok(/allowanceRemainingById\(co0, a\.id\) \+ coAllowanceAmountFor\(r, a\.id\)/.test(f),
     'the generator ignores this change order’s own line, so reopening it does not show the allowance already consumed by the figure sitting in the box');
}
{
  const c = html.split('function newCoCompanyChanged(){')[1].split('\n}')[0];
  ok(/left: allowanceRemainingById\(co, a\.id\)/.test(c),
     'while issuing a new one counts everything already on the log, because none of it is this change order');
}

console.log('The list is built from it');
{
  const h = html.split('function allowRowHTML(pre, list, sel, amt, i){')[1].split('\n}')[0];
  ok(/esc\(allowOptionLabel\(a\)\)/.test(h), 'every option is labelled the same way');
  ok(!/'Allowance '\+esc\(a\.id\)/.test(h), 'and no second copy of the naming is left behind to drift');
}

console.log('The heading no longer repeats itself');
{
  const before = html.split('<div id="nc-allow-wrap">')[0].slice(-260);
  ok(/>Funded from<\/div>/.test(before), 'the section says what the block is for');
  ok(!/>Allowance<\/div>\s*$/.test(before.trim()), 'rather than the same word as the column header below it');
  ok((html.match(/>Funded from<\/div>/g)||[]).length===2, 'in both dialogs');
  ok(/<span class="allow-c1">Allowance<\/span>/.test(html), 'while the column header keeps the word, which is where it does work');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-allowoption.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
