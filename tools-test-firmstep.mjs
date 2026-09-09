// A step names a person and belongs to their firm. Named for who owes it,
// matched on the firm for who may act.
//
// It used to be the named address alone, so one person being away stopped the
// job: nobody else at Architect 2 could move a submittal sitting on Test
// Architect, and the only way through was Fidevia pressing Override — a control
// meant for standing in on somebody else's behalf, recorded as such.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
b.run(`allData.contacts=[
  {'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
  {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test'},
  {'Name':'Gorilla PM','Company':'Gorilla Construction','Email':'g@g.test'},
  {'Name':'Ghost Reviewer','Company':'','Email':'ghost@z.test'}];
allData.sub=[{'Submittal #':'S1','Description':'W','Submitted By (Sub)':'g@g.test (Gorilla Construction)',
  'Company':'Gorilla Construction','Reviewer':'Architect 2','Status':'Pending Review',
  'Workflow Step':'0','Workflow Status':'In Review','Version History':'[]'}];`);
const chain=(steps)=>b.run(`currentProject.config.workflows.sub=${JSON.stringify(steps)}`);
const mine=(email,co)=>{
  b.run(`EXTERNAL=true;IS_ADMIN=false;ME_EMAIL='${email}';ME_NAME='';ME_COMPANY='${co}';
    currentProject.userCompany='${co}';currentProject.userRole='contractor';DATA_READY=true;`);
  return b.run(`(()=>{const st=wfEffectiveSteps('sub',allData.sub[0]);const [gs,ge]=wfGroupAt(st,0);
    return wfMyStepsIn(st,gs,ge).length>0;})()`);
};
const ARCH=[{name:'Architect Review',person:'Test Architect',email:'a@x.test'}];

console.log('Who may act on Architect Review — Test Architect');
chain(ARCH);
ok(mine('a@x.test','Architect 2')===true, 'the person it names');
ok(mine('a2@x.test','Architect 2')===true, 'and anyone else at Architect 2 — one absence no longer stops the job');
ok(mine('a4@x.test','ARCHITECT 2')===true, 'firm matching ignores case');

console.log('Who may not');
ok(mine('p@y.test','Next Level Engineers')===false, 'the engineer, a different firm');
ok(mine('g@g.test','Gorilla Construction')===false, 'the contractor who filed it');
ok(mine('x@v.test','Voltage Electric')===false, 'a rival contractor');
ok(mine('o@i.test','Ithaca')===false, 'the owner');
ok(mine('nobody@z.test','')===false, 'somebody with no company recorded');
ok(mine('a3@x.test','architect-2')===false,
   'and a firm that merely looks similar — the match is exact, not fuzzy');
// Two blanks are not a match. This is the failure that would have opened every
// unattributed step to every user with no company on the project.
chain([{name:'Ghost Review',person:'Ghost Reviewer',email:''}]);
ok(mine('nobody@z.test','')===false, 'a blank company does not match a step with a blank company');
chain([{name:'Mystery Review',person:'Nobody Known',email:''}]);
ok(mine('a@x.test','Architect 2')===false, 'and a step naming somebody unknown belongs to nobody');

console.log('The two gates agree');
ok(/return steps\.slice\(gs,ge\+1\)\.some\(wfStepIsMine\);/.test(html),
   'wfCanAdvance asks wfStepIsMine, so the button offered and the action taken cannot differ');
ok(/const stepCo = String\(s\.company \|\| ''\)\.trim\(\)\.toLowerCase\(\)\s*\n?\s*\|\| companyByName/.test(srv),
   'the server resolves the step’s firm the same way');
ok(/const _g = await grantFor\(t, _grants, 'folder', projectId\); myCo = String\(\(_g && _g\.company\) \|\| ''\)/.test(srv),
   'and takes the caller’s firm from the grant, never from the request');
ok(/return !!myCo && !!stepCo && myCo === stepCo;/.test(srv),
   'with both sides required, so two blanks are not a match there either');
ok(/This step is not assigned to you or your company\./.test(srv),
   'and the refusal says which rule was applied');

console.log('The record still says who actually acted');
{
  b.run(`ME_EMAIL='a2@x.test'; ME_NAME='Second Architect'; ME_COMPANY='Architect 2';
    currentProject.userCompany='Architect 2'; currentProject.userRole='architect';
    currentProject.config.workflows.sub=${JSON.stringify(ARCH)};
    allData.sub[0]['Workflow Step']='0'; allData.sub[0]['Workflow Signed']='';
    openReply('sub',0,true); document.getElementById('reply-action').value='continue';
    document.getElementById('reply-status').value='Approved';
    applyReviewAdvance('sub', allData.sub[0], 'Second Architect');`);
  const sig=JSON.parse(b.run("JSON.stringify(wfSignedMap(allData.sub[0]))"))['0'];
  ok(sig && sig.by==='Second Architect', 'the signature names whoever pressed it, not the step');
  ok(sig && sig.forName==='Test Architect',
     'and records who they stood in for, so the log does not read as though Test Architect answered');
  ok(sig && !sig.override,
     'without calling it an override — they were entitled to act, which is the whole point');
  ok(/for '\+esc\(sig\.forName\)/.test(html), 'and the panel shows it');
}
{
  // The named person acting for themselves gets no such note.
  b.run(`ME_EMAIL='a@x.test'; ME_NAME='Test Architect';
    allData.sub[0]['Workflow Step']='0'; allData.sub[0]['Workflow Signed']='';
    openReply('sub',0,true); document.getElementById('reply-action').value='continue';
    document.getElementById('reply-status').value='Approved';
    applyReviewAdvance('sub', allData.sub[0], 'Test Architect');`);
  const sig=JSON.parse(b.run("JSON.stringify(wfSignedMap(allData.sub[0]))"))['0'];
  ok(sig && !sig.forName, 'the named reviewer acting for themselves is recorded plainly');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-firmstep.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
