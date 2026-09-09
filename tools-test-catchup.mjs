// The rows that are already in this state. SUB-GC-001 was sent back and
// revised before there was a Submit Revision button, so the redraw went in as
// an ordinary new version: filed, and moving nothing. The chain sat on the
// returned step and the architect's overview said nothing needed them.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const base = `allData.contacts=[
 {'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
 {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test'},
 {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'}];
currentProject.config.workflows.sub=[
 {name:'Architect Review',person:'Test Architect',email:'a@x.test'},
 {name:'Engineer Review',person:'Penelope Odiem',email:'p@y.test',parallel:true}];
allData.rfi=[];allData.co=[];allData.pay_apps=[];`;
// Exactly as it sits in Box: no signature record, no address on the returned
// step, and the revision already filed as v3.
const row = (vers) => `allData.sub=[{'Submittal #':'SUB-GC-001','Description':'Wall',
 'Submitted By (Sub)':'gc@s.test (Summit Builders)','Company':'Summit Builders','Reviewer':'Architect 2',
 'Status':'Resubmitted','Workflow Step':'2','Workflow Status':'In Review','Workflow Signed':'',
 'Workflow Extra':JSON.stringify([{after:1,name:'Revise and Resubmit',person:'Test Contractor',
   company:'Summit Builders',email:'',returned:true}]),
 'Version History':JSON.stringify(${vers})}];`;
const V = `[{v:1,status:'Pending Review',date:'2026-09-08',by:'gc@s.test',co:'Summit Builders'},
 {v:2,status:'Revise and Resubmit',date:'2026-09-08',by:'Test Architect',co:'Architect 2'},
 {v:3,status:'Resubmitted',date:'2026-09-08',by:'Test Contractor',co:'Summit Builders'}]`;
const as=(e,co,r)=>b.run(`EXTERNAL=true;IS_ADMIN=false;ME_EMAIL='${e}';ME_NAME='';
  currentProject.userCompany='${co}';currentProject.userRole='${r}';DATA_READY=true;renderAll();`);
const names=()=>JSON.parse(b.run("JSON.stringify(wfEffectiveSteps('sub',allData.sub[0]).map(s=>s.name))"));
const att=()=>b.run("document.getElementById('attention-panel').innerHTML").replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

console.log('The word that broke it');
// WF_RETURNED is looking for the word, and "Resubmitted" contains it. Reading
// the answer as another instruction, the catch-up decided the last thing that
// happened was a return and there was nothing to catch up on.
ok(b.run("wfIsReturnOutcome('Revise and Resubmit')")===true, 'the instruction is a return');
ok(b.run("wfIsReturnOutcome('Resubmitted')")===false, 'the answer to it is not');
ok(b.run("wfIsReturnOutcome('Returned for revision')")===true, 'other wordings still are');

console.log('Catching the row up, on nothing but a page load');
b.run(base); b.run(row(V)); as('a@x.test','Architect 2','architect');
{
  const s=names();
  ok(s.length===4 && s[3]==='Architect Review', 'the reviewer is asked again ('+s.join(' -> ')+')');
  ok(b.run("+allData.sub[0]['Workflow Step']")===3, 'and the item is moved onto them');
  ok(/SUB-GC-001/.test(att()), 'so it appears on their overview');
  ok(/Awaiting you/.test(b.run("wfProgressHTML('sub',allData.sub[0],0)")), 'as theirs');
}
// The step that made the decision is the architect's, not the engineer's — the
// tail of a parallel group is just whoever was listed last.
ok(b.run("(()=>{const st=wfEffectiveSteps('sub',allData.sub[0]);return wfReturnSource(allData.sub[0],st,2);})()")===0,
   'the return is traced to whoever wrote it, not to the end of their group');
{
  const panel=b.run("wfProgressHTML('sub',allData.sub[0],0)");
  ok(/Revise and Resubmit[^<]*<\/span>|Revise and Resubmit/.test(panel) && /Test Architect/.test(panel),
     'and their decision is attributed from the version they wrote');
  ok(!/Architect Review<\/span>[\s\S]{0,200}not required/.test(panel),
     'rather than the deciding step reading "not required — the group moved on"');
}
as('gc@s.test','Summit Builders','contractor');
ok(!/SUB-GC-001/.test(att()), 'and it is off the contractor’s list — they already sent it');

console.log('What it will not touch');
// No revision filed yet: it stays with the contractor.
b.run(base); b.run(row(`[{v:1,status:'Pending Review',by:'gc@s.test',co:'Summit Builders'},
 {v:2,status:'Revise and Resubmit',by:'Test Architect',co:'Architect 2'}]`));
as('a@x.test','Architect 2','architect');
ok(names().length===3, 'a return nobody has answered is left where it is');
ok(!/SUB-GC-001/.test(att()), 'and stays off the reviewer’s list');
// A row that already carries real attribution is not rewritten.
b.run(base); b.run(row(V));
b.run(`allData.sub[0]['Workflow Signed']=JSON.stringify({'1':{by:'Penelope Odiem',at:'2026-09-08',outcome:'Approved'}});`);
as('a@x.test','Architect 2','architect');
ok(/Penelope Odiem/.test(b.run("JSON.stringify(wfSignedMap(allData.sub[0]))")),
   'a signature already on the record survives');
ok(!/"0"/.test(b.run("JSON.stringify(wfSignedMap(allData.sub[0]))")),
   'and nothing is invented alongside it');
// Twice is once.
b.run(base); b.run(row(V)); as('a@x.test','Architect 2','architect'); b.run("renderAll();renderAll()");
ok(names().length===4, 'drawing the page three times catches it up once');

ok(/wfHealReturnSignature\(key,row\)/.test(html) && /wfHealResubmit\(key,row\)/.test(html),
   'and all of it runs off the page load, so nobody has to press anything');

console.log((bad?'FAIL ':'ok   ')+'tools-test-catchup.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
