// Adding a second prime to a firm that already had one took its money off the
// books: Summit's billed-to-date went from $272,354 to $0 and a $7,000
// allowance draw disappeared, on a project where nothing had been deleted.
//
// Two faults. The Financial Summary's allowance panel still resolved by company
// name, so a firm holding two contracts matched neither and the panel came back
// empty - while Settings, already moved onto contracts, showed them correctly.
// And rows filed before the split carry no contract, which nothing can deduce,
// so they have to be assigned once rather than guessed at.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage('index.html'); P.run(SEED);

const seed=()=>P.run(`IS_ADMIN=true; EXTERNAL=false;
  currentProject.config={contractors:[
    {name:'Summit Builders', role:'GC', contract:2000000,
     allowances:[{id:'A',name:'Materials',amount:10000},{id:'B',name:'Landscaping',amount:20000}]},
    {name:'Summit Builders', role:'MC', contract:1000000,
     allowances:[{id:'MC1',name:'Curbs',amount:18000}]},
    {name:'Gorilla Construction', role:'PC', contract:1000000,
     allowances:[{id:'A',name:'Panels',amount:25000}]}]};
  allData.co=[{'CO #':'CO-GC-002','Company':'Summit Builders','Cost Impact':'7000',
     'Approved Amount':'7000','Status':'Approved','Allowance':'A',
     'Allowance Splits':JSON.stringify([{id:'A',amount:7000}]),'Applied to Allowance':'7000'}];
  allData.co.push({'CO #':'CO-GOR-1','Company':'Gorilla Construction','Cost Impact':'500',
     'Approved Amount':'500','Status':'Approved'});
  allData.pay_apps=[{'App #':'PA-001_Summit Builders','Contractor':'Summit Builders',
     'Requested Amount':'272354','Approved Amount':'272354','Status':'Approved'},
    {'App #':'PA-001_Gorilla','Contractor':'Gorilla Construction',
     'Requested Amount':'1000','Approved Amount':'1000','Status':'Approved'}];
  renderFinancials(); 1;`);

console.log('The allowance panel reads by contract, not by company');
seed();
{
  const gc=JSON.parse(P.run("JSON.stringify(allowanceSummaryFor(currentProject.config.contractors[0]))"));
  const mc=JSON.parse(P.run("JSON.stringify(allowanceSummaryFor(currentProject.config.contractors[1]))"));
  ok(gc.length===2, 'the GC contract still shows its two allowances');
  ok(mc.length===1 && mc[0].id==='MC1', 'and the MC contract shows its own');
  ok(gc.every(a=>a.id!=='MC1'), 'neither borrows the other’s');
}
ok(/const withAllow=contractors\.map\(c=>\(\{c, list:allowanceSummaryFor\(c\)\}\)\)/.test(html),
   'the panel passes the contract, not the name');
{
  P.run("renderAllowances();");
  const t=P.run("document.getElementById('tbody-allowances').innerHTML").replace(/<[^>]+>/g,' ');
  ok(/Materials/.test(t) && /Landscaping/.test(t) && /Curbs/.test(t),
     'and the rendered panel carries all three, across both of Summit\u2019s contracts');
  ok(/GC/.test(t) && /MC/.test(t), 'with each band naming the contract, not just the firm');
}
ok(!/allowanceSummaryFor\(c\.name\)/.test(html), 'nothing asks it by company name any more');

console.log('The same, on the shape Manage Contractors actually saves');
// A firm holding several primes is stored as one record with a list of lines,
// not as several records. Iterating the records rather than the contracts
// therefore sees ONE Summit, with whatever allowances happen to sit at the top
// of the record - which is how the panel came back wrong in the first place.
{
  const P2=bootPage('index.html'); P2.run(SEED);
  P2.run(`IS_ADMIN=true; EXTERNAL=false;
    currentProject.config={contractors:[
      {name:'Summit Builders', lines:[
        {role:'GC', contract:2000000, allowances:[{id:'A',name:'Materials',amount:10000}]},
        {role:'MC', contract:1000000, allowances:[{id:'MC1',name:'Curbs',amount:18000}]}]},
      {name:'Gorilla Construction', role:'PC', contract:1000000,
       allowances:[{id:'A',name:'Panels',amount:25000}]}]};
    allData.co=[]; allData.pay_apps=[]; renderAllowances(); 1;`);
  const t=P2.run("document.getElementById('tbody-allowances').innerHTML").replace(/<[^>]+>/g,' ');
  ok(/Materials/.test(t), 'the GC allowance is drawn');
  ok(/Curbs/.test(t), 'and the MC allowance, from the second line of the same record');
  ok(/Panels/.test(t), 'along with the other firm\u2019s');
  ok((t.match(/Summit Builders/g)||[]).length===2,
     'Summit appears once per contract, not once as a company');
}

console.log('Rows that predate the split are counted, named and explained');
{
  const t=P.run("document.getElementById('fin-unattributed').innerHTML").replace(/<[^>]+>/g,' ');
  ok(P.run("document.getElementById('fin-unattributed').style.display")==='block', 'the notice is shown');
  ok(/Summit Builders/.test(t), 'naming the firm');
  ok(/holds 2 contracts/.test(t), 'and how many contracts it now holds');
  ok(/1 change order and 1 payment application/.test(t), 'and exactly what is unattributed');
  ok(/counted against neither contract/.test(t), 'and what that means for the figures');
  ok(!/Gorilla/.test(t),
     'a firm holding one contract is not mentioned, though its rows carry no contract \u2014 '
     +'its name is unambiguous, so there is nothing to answer');
}
{
  const f=JSON.parse(P.run("JSON.stringify(unattributedByFirm())"));
  ok(Object.keys(f).join()==='Summit Builders', 'only the two-contract firm is listed');
  ok(f['Summit Builders'].co.length===1 && f['Summit Builders'].pay.length===1,
     'with both logs counted');
  ok(f['Summit Builders'].trades.map(t=>t.key).join()==='GC,MC',
     'and both contracts offered as the answer');
}

console.log('Assigning them puts the money back where it was');
P.run("allData.co[0]['Trade']='GC'; allData.pay_apps[0]['Trade']='GC'; renderFinancials();");
ok(P.run("allowanceUsedById(currentProject.config.contractors[0],'A')")===7000,
   'the $7,000 draw is on the GC contract again');
{
  const gc=JSON.parse(P.run("JSON.stringify(allowanceSummaryFor(currentProject.config.contractors[0]))"));
  const a=gc.find(x=>x.id==='A');
  ok(a && a.used===7000, 'and the panel shows it as drawn');
  ok(a && a.left===3000, 'with $3,000 left, as it read before the split');
  ok(a && a.activity.length===1, 'and the change order that drew it is named against it');
}
ok(P.run("allowanceUsedById(currentProject.config.contractors[1],'A')")===0,
   'and not on the MC one');
ok(P.run("(allData.pay_apps||[]).filter(billedAgainst(currentProject.config.contractors[0])).length")===1,
   'the payment application counts against GC');
ok(P.run("(allData.pay_apps||[]).filter(billedAgainst(currentProject.config.contractors[1])).length")===0,
   'and not against MC');
ok(P.run("document.getElementById('fin-unattributed').style.display")==='none',
   'and the notice goes away, because there is nothing left to say');

console.log('It writes both logs, and only the rows it named');
{
  const fn=html.split('async function assignUnattributed')[1].split('async function alwRenumber')[0];
  ok(/MODULES\.co/.test(fn) && /MODULES\.pay_apps/.test(fn), 'both logs are written');
  ok(/!String\(r\['Trade'\]\|\|''\)\.trim\(\)/.test(fn),
     'and a row that already says which contract is left alone');
  ok(/confirm\(/.test(fn), 'it asks first');
  ok(/No figure changes/.test(fn), 'saying plainly that nothing is being recalculated');
  ok(/auditLog\('Records assigned to a contract'/.test(fn), 'and it reaches the audit log');
}
ok(/id="fin-unattributed"/.test(html) && /class="admin-only" id="fin-unattributed"/.test(html),
   'the notice is Fidevia’s, not a contractor’s');

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
