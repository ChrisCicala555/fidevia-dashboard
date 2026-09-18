// "I like this formatting for allowances - can we do this instead now that we
// are sorting by prime roles?"  GC1, MC1, PC1, EC1, as the specification (§4.3)
// numbers them.
//
// A letter said nothing about whose contract it belonged to, so "Allowance B"
// meant three different sums on a job with three primes. Renumbering an
// existing job means moving two things together: the ids themselves, and every
// change order that named one. A draw recorded against B has to come back
// pointing at MC2 or the money hangs off a reference that no longer exists.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P=bootPage('index.html'); P.run(SEED);
const L=(name,role,allowances)=>({name,role,allowances});

console.log('A reference names the prime it sits under');
[['GC','GC1','GC3'],['MC','MC1','MC3'],['PC','PC1','PC3'],['EC','EC1','EC3']].forEach(([r,a,c])=>{
  ok(P.run(`allowanceIdFor(${JSON.stringify({name:'X',role:r})},0)`)===a, r+' starts at '+a);
  ok(P.run(`allowanceIdFor(${JSON.stringify({name:'X',role:r})},2)`)===c, 'and counts up to '+c);
});
ok(P.run(`allowanceIdFor(${JSON.stringify({name:'X',role:'OTHER'})},0)`)==='A',
   'a contract with no prime keeps a letter rather than claiming one it does not hold');
ok(P.run("allowanceIdFor(null,1)")==='B', 'and so does one with no trade at all');

console.log('Renumbering says what it would do before doing it');
const seed=()=>P.run(`
  currentProject.config={contractors:[
    {name:'LA Building Contractors', role:'GC', allowances:[{id:'A',name:'Karst',amount:50000},
                                                            {id:'B',name:'Trench rock',amount:20000}]},
    {name:'Garden Spot Mechanical', role:'MC', allowances:[{id:'A',name:'Shutoffs',amount:10000}]},
    {name:'Garden Spot Mechanical', role:'PC', allowances:[{id:'A',name:'Carriers',amount:8000}]}]};
  allData.co=[
    {'CO #':'CO-001','Company':'LA Building Contractors','Allowance':'B','Allowance Splits':'',
     'Applied to Allowance':'5000','Cost Impact':'5000','Status':'Approved'},
    {'CO #':'CO-002','Company':'Garden Spot Mechanical','Allowance':'A','Allowance Splits':'',
     'Applied to Allowance':'2000','Cost Impact':'2000','Status':'Approved'}];
  1;`);
seed();
let plan=JSON.parse(P.run("JSON.stringify(alwRenumberPlan())"));
ok(plan.renamed.length===4, 'four allowances would be renumbered ('+plan.renamed.length+')');
{
  const pairs=plan.renamed.map(r=>r.from+'→'+r.to).join(', ');
  ok(/A→GC1/.test(pairs) && /B→GC2/.test(pairs), 'the GC ones become GC1 and GC2: '+pairs);
  ok(/A→MC1/.test(pairs) && /A→PC1/.test(pairs),
     'and the two Garden Spot primes get their own, not one shared');
}
// Only the GC one. The Garden Spot draw names a firm holding TWO primes, and
// a change order does not yet record which contract it was against, so there
// is no honest way to say whether it drew on the mechanical or the plumbing.
ok(plan.cos.length===1, 'one change order can be tied to a contract and rewritten');
ok(plan.unmatched===1,
   'and one cannot be, which is counted rather than guessed at');
ok(P.run("allData.co[0]['Allowance']")==='B', 'and nothing has been written yet');
ok(P.run("currentProject.config.contractors[0].allowances[0].id")==='A', 'nor on the allowances');

console.log('Applying it moves both together');
P.run("alwApplyRenumber(alwRenumberPlan())");
ok(P.run("currentProject.config.contractors[0].allowances[0].id")==='GC1', 'the GC allowance is GC1');
ok(P.run("currentProject.config.contractors[0].allowances[1].id")==='GC2', 'and the second GC2');
ok(P.run("currentProject.config.contractors[1].allowances[0].id")==='MC1', 'the mechanical one MC1');
ok(P.run("currentProject.config.contractors[2].allowances[0].id")==='PC1', 'and the plumbing one PC1');
ok(P.run("allData.co[0]['Allowance']")==='GC2',
   'the change order that drew against B now names GC2 — the same allowance');
ok(P.run("allData.co[1]['Allowance']")==='A',
   'while the one on a two-prime firm is left exactly as it was');
ok(P.run("allData.co[1]['Allowance Splits']")==='',
   'and is not even rewritten into the same values \u2014 a row that cannot be '
   +'attributed is not touched, so nothing about it can be lost');
{
  const sp=JSON.parse(P.run("allData.co[0]['Allowance Splits']"));
  ok(sp.length===1 && sp[0].id==='GC2' && sp[0].amount===5000,
     'the split carries the new id and the same money');
}

console.log('The money still lands where it did');
ok(P.run("allowanceUsedById('LA Building Contractors','GC2')")===5000,
   'the GC draw is still found, under its new reference');
ok(P.run("allowanceUsedById('LA Building Contractors','GC1')")===0, 'and not against the wrong one');

console.log('Running it twice changes nothing the second time');
plan=JSON.parse(P.run("JSON.stringify(alwRenumberPlan())"));
ok(plan.renamed.length===0, 'nothing left to rename');
ok(plan.cos.length===0, 'and no change order to rewrite');

console.log('It touches only what it has a mapping for');
P.run(`
  currentProject.config={contractors:[
    {name:'LA Building Contractors', role:'GC', allowances:[
      {id:'GC1',name:'Already numbered',amount:1000},
      {id:'B',name:'Not yet',amount:2000}]}]};
  allData.co=[
    {'CO #':'CO-020','Company':'LA Building Contractors','Allowance':'',
     'Allowance Splits':JSON.stringify([{id:'GC1',amount:100},{id:'B',amount:200}]),
     'Applied to Allowance':'300','Cost Impact':'300','Status':'Approved'}];
  1;`);
{
  const p3=JSON.parse(P.run("JSON.stringify(alwRenumberPlan())"));
  ok(p3.renamed.length===1 && p3.renamed[0].from==='B' && p3.renamed[0].to==='GC2',
     'only the one that is changing is listed');
  ok(p3.cos.length===1 && p3.cos[0].from.join()==='B',
     'and the change order is listed for that id alone, not for GC1 as well');
}
P.run("alwApplyRenumber(alwRenumberPlan())");
ok(P.run("currentProject.config.contractors[0].allowances[0].id")==='GC1',
   'an allowance already carrying its reference keeps it');
ok(P.run("currentProject.config.contractors[0].allowances[1].id")==='GC2', 'and the other takes GC2');
{
  const sp=JSON.parse(P.run("allData.co[0]['Allowance Splits']"));
  ok(sp.map(x=>x.id).join()==='GC1,GC2', 'both halves of the split point at the right allowance');
  ok(sp.map(x=>x.amount).join()==='100,200', 'with the money unchanged');
  ok(P.run("allData.co[0]['Allowance']")==='GC1+GC2', 'and the joined reference is rewritten too');
}

console.log('An allowance saved without a reference gets one from its prime');
P.run(`currentProject.config={contractors:[
    {name:'Voltage Electric', role:'EC', allowances:[{name:'No id at all',amount:500}]}]};
  allData.co=[]; 1;`);
ok(JSON.parse(P.run("JSON.stringify(allowancesFor('Voltage Electric'))"))[0].id==='EC1',
   'it reads as EC1 rather than falling back to a letter');

console.log('A firm with two primes does not have its draws crossed over');
P.run(`currentProject.config={contractors:[
    {name:'Garden Spot Mechanical', role:'MC', allowances:[{id:'A',name:'Shutoffs',amount:10000}]},
    {name:'Garden Spot Mechanical', role:'PC', allowances:[{id:'A',name:'Carriers',amount:8000}]}]};
  allData.co=[{'CO #':'CO-010','Company':'Garden Spot Mechanical','Allowance':'A','Allowance Splits':'',
     'Applied to Allowance':'1000','Cost Impact':'1000','Status':'Approved'}];
  1;`);
{
  const p2=JSON.parse(P.run("JSON.stringify(alwRenumberPlan())"));
  ok(p2.unmatched===1,
     'a draw that cannot be tied to one of the two contracts is counted, not guessed at');
  ok(p2.cos.length===0, 'and is left alone rather than rewritten into the wrong one');
}

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
