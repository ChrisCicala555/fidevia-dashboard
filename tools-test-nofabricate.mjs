// A version is not a return.
//
// The architect had asked for nothing. The contractor posted a new version,
// which was recorded as "Resubmitted" — and the repair that puts a returned
// item back with whoever filed it read that word as evidence somebody had sent
// it back, invented a Revise and Resubmit step, and moved the chain onto it,
// past an architect still reading the thing.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const setup=(key,extra)=>b.run(`allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
  {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test'},
  {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'}];
currentProject.config.workflows.${key}=[{name:'Architect Review',person:'Test Architect',email:'a@x.test'},
  {name:'Engineer Review',person:'Penelope Odiem',email:'p@y.test',parallel:true}];
allData.${key}=[Object.assign({'${key==='rfi'?'RFI #':'Submittal #'}':'X-001','Subject':'s','Description':'d',
  'Submitted By':'gc@s.test (Summit Builders)','Submitted By (Sub)':'gc@s.test (Summit Builders)',
  'Company':'Summit Builders','Status':'Open','Workflow Step':'0','Workflow Status':'In Review',
  'Version History':'[]','Workflow Extra':'','Workflow Signed':''}, ${extra||'{}'})]; DATA_READY=true;`);
const asGC=()=>b.run(`EXTERNAL=true;IS_ADMIN=false;ME_EMAIL='gc@s.test';ME_NAME='Test Contractor';
  ME_COMPANY='Summit Builders';currentProject.userCompany='Summit Builders';currentProject.userRole='contractor';`);
const chain=key=>JSON.parse(b.run(`JSON.stringify(wfEffectiveSteps('${key}',allData.${key}[0]).map(s=>s.name))`));

console.log('The word that caused it');
ok(b.run("wfIsReturnOutcome('Revise and Resubmit')")===true, 'a request to revise is a return');
ok(b.run("wfIsReturnOutcome('Resubmitted')")===false, 'an answer to one is not');
ok(/if\(!wfIsReturnOutcome\(String\(row\['Status'\]\|\|''\)\)\) return false;/.test(html),
   'and the repair asks the precise question rather than matching the word');
ok(!/if\(!WF_RETURNED\.test\(String\(row\['Status'\]\|\|''\)\)\) return false;/.test(html),
   'the loose test is gone from it');

console.log('Nothing is invented, in either module');
for(const key of ['rfi','sub']){
  // Even if the status somehow says Resubmitted, no return step is conjured.
  setup(key, `{'Status':'Resubmitted'}`); asGC(); b.run("renderAll()");
  ok(chain(key).length===2, key+': a resubmitted status alone does not add a step ('+chain(key).join(' → ')+')');
  ok(b.run(`allData.${key}[0]['Workflow Step']`)==='0', key+': and the chain stays with the reviewer');
  // A real return still repairs.
  setup(key, `{'Status':'Revise and Resubmit'}`); b.run("renderAll()");
  ok(chain(key).length===3 && chain(key)[2]==='Revise and Resubmit',
     key+': while a genuine return is still put right');
}

console.log('And the contractor’s version is not called a resubmission');
setup('rfi'); asGC();
{
  const would=b.run("(()=>{const r=allData.rfi[0];"
    +"return (replyIsSubmitterSide('rfi',r)&&!replyClosedReason('rfi',r)&&replyOnReturnedStep('rfi',r))?'Resubmitted':r['Status'];})()");
  ok(would==='Open', 'a version filed while the item is with a reviewer leaves the status alone ('+would+')');
}
setup('rfi', `{'Workflow Step':'2','Status':'Revise and Resubmit',
  'Workflow Extra':JSON.stringify([{after:1,name:'Revise and Resubmit',person:'Test Contractor',
    company:'Summit Builders',email:'gc@s.test',returned:true}])}`);
asGC();
{
  const would=b.run("(()=>{const r=allData.rfi[0];"
    +"return (replyIsSubmitterSide('rfi',r)&&!replyClosedReason('rfi',r)&&replyOnReturnedStep('rfi',r))?'Resubmitted':r['Status'];})()");
  ok(would==='Resubmitted', 'but answering an actual return is a resubmission');
}
{
  const c = html.split('function replyOnReturnedStep')[1].split('\n// The reader is the side')[0];
  ok(/steps\.slice\(gs,ge\+1\)\.some\(st=>st&&st\.returned\)/.test(c),
     'which is decided by the step being a returned one');
  ok(/if\(!steps\.length \|\| wfIsDone\(row\) \|\| wfIsStopped\(row\)\) return false;/.test(c),
     'and never on an item with no chain, or one already settled');
}
ok(/const _answering=replyIsSubmitterSide\(key,_row0\) && !_closed && replyOnReturnedStep\(key,_row0\);/.test(html),
   'the write uses all three conditions');

console.log((bad?'FAIL ':'ok   ')+'tools-test-nofabricate.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
