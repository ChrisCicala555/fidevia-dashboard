// An advance that fails, or that changes nothing, must not pass for one that
// worked. It used to: applyReviewAdvance threw into a console.warn, the version
// was written anyway, and the reader was told the chain had moved on. What is
// left on the record is a resubmission with the item still sitting on the step
// it was resubmitted from — which is precisely what a reader then reports as
// "I resubmitted and the workflow still shows the old step".
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const c = html.split('async function submitReply')[1].split('\n// Completing a review')[0];

console.log('A failure is a failure');
ok(/throw new Error\('The review could not be recorded against the workflow \('/.test(c),
   'a thrown advance stops the save rather than being logged and ignored');
ok(/Nothing has been saved — reload and try again\./.test(c),
   'and says nothing was written, which is now true because the throw is before the write');
{
  const i=c.indexOf('applyReviewAdvance'), w=c.indexOf("prog.textContent='Updating log…'");
  ok(i>0 && w>i, 'the advance runs before anything is written');
  const t=c.indexOf('throw new Error(\'The review could not be recorded');
  ok(t>i && t<w, 'and the refusal lands between the two, so a half-written record is impossible');
}
ok(!/catch\(e\)\{ console\.warn\('advance:',e\.message\); \}\n    \}/.test(c),
   'the bare swallow is gone');

console.log('An advance that changes nothing is not an advance');
ok(/const _before=String\(row\['Workflow Step'\]\|\|''\)/.test(c), 'the workflow fields are snapshotted before');
ok(/const _after=String\(row\['Workflow Step'\]\|\|''\)/.test(c), 'and compared after');
for(const f of ['Workflow Step','Workflow Status','Workflow Extra','Workflow Signed','Workflow Reassigned']){
  const before=c.split('const _before=')[1].split(';')[0];
  ok(before.includes("'"+f+"'"), 'the comparison covers '+f);
}
ok(/if\(_after===_before\) _advanced=false;/.test(c),
   'and an untouched chain is reported as untouched');
ok(/this step is not yours/.test(c),
   'with the reader told why, rather than told their review moved the chain');

console.log('It still works when it works');
{
  const b = bootPage('index.html'); b.run(SEED);
  b.run(`allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
    {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test'},
    {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'}];
  currentProject.config.workflows.sub=[{name:'Architect Review',person:'Test Architect',email:'a@x.test'},
    {name:'Engineer Review',person:'Penelope Odiem',email:'p@y.test',parallel:true}];
  allData.sub=[{'Submittal #':'SUB-GC-002','Description':'d','Submitted By (Sub)':'gc@s.test (Summit Builders)',
    'Company':'Summit Builders','Reviewer':'Architect 2','Status':'Revise and Resubmit',
    'Workflow Step':'2','Workflow Status':'In Review','Workflow Signed':'','Version History':'[]',
    'Workflow Extra':JSON.stringify([{after:1,name:'Revise and Resubmit',person:'Test Contractor',
      company:'Summit Builders',email:'gc@s.test',returned:true}])}];
  EXTERNAL=true;IS_ADMIN=false;ME_EMAIL='gc@s.test';ME_NAME='Test Contractor';ME_COMPANY='Summit Builders';
  currentProject.userCompany='Summit Builders';currentProject.userRole='contractor';DATA_READY=true;`);
  b.run("openReply('sub',0,true); applyReviewAdvance('sub',allData.sub[0],'Test Contractor');");
  ok(b.run("allData.sub[0]['Workflow Step']")==='3', 'the resubmission moves the chain off the returned step');
  const nw=JSON.parse(b.run("JSON.stringify(wfNowWith('sub',allData.sub[0]))"));
  ok(nw && nw.label==='Test Architect', 'onto the reviewer who asked for it');
  const panel=b.run("wfProgressHTML('sub',allData.sub[0],0)").replace(/<[^>]+>/g,' ');
  ok(/Awaiting: Test Architect/.test(panel),
     'and the panel says the same thing the email says — they read one row, so they cannot disagree');
  ok(!/Awaiting you/.test(panel), 'not that it is still with the contractor');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-advancefail.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
