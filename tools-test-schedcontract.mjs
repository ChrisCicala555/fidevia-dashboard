// "Can we say their contract title here as well?"
//
// Summit Builders was on the schedule panel twice, identically — two rows, two
// green dots, the same two files under both. A schedule is filed per COMPANY:
// one folder, matched on the name in the filename. A firm holding two primes
// posts one programme covering both, so there was never a second answer to
// give; the panel was asking the server the same question twice because the
// contract list names the firm twice.
//
// One row per firm now, saying which contracts it covers.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage('index.html'); P.run(SEED);

const setup=cts=>P.run(`(function(){ currentProject.config.contractors=${JSON.stringify(cts)}; return 1; })()`);

console.log('The contracts a firm holds, as a label');
{
  setup([{name:'Summit Builders',role:'GC'},{name:'Summit Builders',role:'MC'},
         {name:'Gorilla Construction',role:'EC'},{name:'Odd Job',role:'Other',label:'Signage'},
         {name:'Gone',role:'PC',active:false}]);
  const L=c=>P.run(`contractLabelFor(${JSON.stringify(c)})`);
  ok(L('Summit Builders')==='GC · MC', 'a firm on two primes names both');
  ok(L('Gorilla Construction')==='EC', 'a firm on one names it');
  ok(L('Odd Job')==='OC — Signage', 'and a contract outside the four reads as what it is');
  ok(L('Nobody')==='', 'a firm holding none says nothing rather than an empty separator');
  ok(L('')==='' && L(null)==='', 'and so does nothing at all');
  ok(L('summit builders')==='GC · MC', 'matched the way every other contract lookup is');
  // A contract line whose trade was never set has no title to print. It must
  // not leave a separator hanging off the ones that do — which is the reading
  // "Summit Builders GC ·" invites: a second contract, unnamed.
  setup([{name:'Half Done',role:'GC'},{name:'Half Done',role:''}]);
  ok(P.run(`contractLabelFor('Half Done')`)==='GC',
     'an untitled contract is left out rather than printed as a dangling separator');
  setup([{name:'Half Done',role:''}]);
  ok(P.run(`contractLabelFor('Half Done')`)==='',
     'and a firm whose only contract is untitled says nothing at all');
}

console.log('One row per firm, not one per contract');
{
  const cos=P.run(`(function(){
    currentProject.config.contractors=[{name:'Summit Builders',role:'GC'},{name:'Summit Builders',role:'MC'},
      {name:'Gorilla Construction',role:'EC'}];
    return JSON.stringify(wfScopeFirms((currentProject.config.contractors||[])
      .filter(c=>c.active!==false).map(c=>c.name))); })()`);
  ok(JSON.parse(cos).length===2, 'two firms, two rows — not three');
  ok(JSON.parse(cos)[0]==='Summit Builders', 'Summit once');

  const src=html.split('async function renderScheduleUploads')[1].slice(0, 1400);
  ok(/let cos=wfScopeFirms\(/.test(src),
     'the panel asks the server once per firm, which is all it can answer');
  ok(!/\.map\(c=>String\(c\.name\|\|''\)\.trim\(\)\)\.filter\(Boolean\)/.test(src),
     'and no longer builds the list straight off the contract lines');
}

console.log('The row says which contracts it covers');
{
  const head=html.split("const head='<div class=\"sched-group-head\"")[1].slice(0, 900);
  ok(/contractLabelFor\(r\.company\)/.test(head), 'the label is on the row');
  ok(head.indexOf('contractLabelFor') > head.indexOf('esc(r.company)'),
     'after the company name, where a reader is already looking');
  ok(head.indexOf('contractLabelFor') < head.indexOf('sched-state'),
     'and before the state chip, so the two do not read as one phrase');
  ok(/cl \? /.test(head), 'a firm with no contract on this job adds no stray separator');
}

console.log('An inactive contract does not count');
{
  setup([{name:'Summit Builders',role:'GC'},{name:'Summit Builders',role:'MC',active:false}]);
  ok(P.run(`contractLabelFor('Summit Builders')`)==='GC',
     'a contract taken off the job is not one they still hold');
}

console.log(bad?`\n${bad}/${n} failed`:`\n${n} checks passed`);
process.exit(bad?1:0);
