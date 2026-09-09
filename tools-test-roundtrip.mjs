// Send back, revise, review again. The chain used to end at the return: the
// contractor's revision signed off the last step and the submittal read
// "Workflow complete" with nobody having looked at the new drawing, while the
// architect's overview said nothing needed them.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
b.run(`allData.contacts=[
 {'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test','Notify - Submittal':'Yes'},
 {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test','Notify - Submittal':'Yes'},
 {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test','Notify - Submittal':'No'}];
currentProject.config.workflows.sub=[
 {name:'Architect Review',person:'Test Architect',email:'a@x.test'},
 {name:'Engineer Review',person:'Penelope Odiem',email:'p@y.test',parallel:true}];
allData.rfi=[];allData.co=[];allData.pay_apps=[];
allData.sub=[{'Submittal #':'SUB-GC-001','Description':'Wall','Submitted By (Sub)':'gc@s.test (Summit Builders)',
 'Company':'Summit Builders','Reviewer':'Architect 2','Status':'Pending Review',
 'Workflow Step':'0','Workflow Status':'In Review','Version History':'[]','Workflow Extra':''}];`);
const as=(e,co,r)=>b.run(`EXTERNAL=true;IS_ADMIN=false;ME_EMAIL='${e}';ME_NAME='';
  currentProject.userCompany='${co}';currentProject.userRole='${r}';DATA_READY=true;renderAll();`);
const act=(s)=>b.run(`(()=>{openReply('sub',0,true);document.getElementById('reply-action').value='continue';
  document.getElementById('reply-status').value=${JSON.stringify(s)};
  applyReviewAdvance('sub',allData.sub[0],ME_EMAIL);})()`);
const names=()=>JSON.parse(b.run("JSON.stringify(wfEffectiveSteps('sub',allData.sub[0]).map(s=>s.name))"));
const waiting=()=>b.run("(()=>{const st=wfEffectiveSteps('sub',allData.sub[0]);const i=+allData.sub[0]['Workflow Step'];return st[i]?(st[i].person||st[i].name):'(end)';})()");
const att=()=>b.run("document.getElementById('attention-panel').innerHTML").replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

console.log('The architect sends it back');
as('a@x.test','Architect 2','architect'); act('Revise and Resubmit');
b.run("allData.sub[0]['Status']='Revise and Resubmit'; renderAll()");
ok(waiting()==='Test Contractor', 'the item is with whoever filed it ('+waiting()+')');

console.log('The contractor revises');
as('gc@s.test','Summit Builders','contractor');
b.run("document.getElementById('reply-status-field').style.display='none'");
act('Resubmitted'); b.run("allData.sub[0]['Status']='Resubmitted'; renderAll()");
ok(b.run("allData.sub[0]['Workflow Status']")==='In Review',
   'the chain stays open — a revision nobody has read is not a finished review');
ok(waiting()==='Test Architect', 'and goes back to the reviewer who asked for it ('+waiting()+')');
ok(names().filter(x=>x==='Architect Review').length===2,
   'as a second Architect Review, so the first one and what it said are still on the record');
ok(b.run("REPLY_CTX&&REPLY_CTX._addedEmail")==='a@x.test',
   'who is emailed directly, whatever their notification toggles say');
ok(/revision/.test(b.run("wfProgressHTML('sub',allData.sub[0],0)")),
   'and the new step is labelled as the revision, not as an ordinary addition');
{
  const nw=JSON.parse(b.run("JSON.stringify(wfNowWith('sub',allData.sub[0]))"));
  ok(nw && nw.label==='Test Architect' && !nw.returned,
     'the Now With line on the email names them, and no longer says revise and resubmit');
}

console.log('Who it appears for');
as('a@x.test','Architect 2','architect');
ok(/SUB-GC-001/.test(att()), 'it is back on the architect’s overview');
ok(/Review &amp; Continue|Review & Continue/.test(b.run("verThreadRows('sub',allData.sub[0],0,10)")),
   'with a review to complete');
as('p@y.test','Next Level Engineers','engineer');
ok(!/SUB-GC-001/.test(att()),
   'the engineer, who objected to nothing, is not dragged back in');
as('gc@s.test','Summit Builders','contractor');
ok(!/SUB-GC-001/.test(att()), 'and it is off the contractor’s list');

console.log('And it can finish');
as('a@x.test','Architect 2','architect'); act('Approved'); b.run("renderAll()");
ok(b.run("allData.sub[0]['Workflow Status']")==='Complete', 'approving the revision completes the chain');
ok(b.run("allData.sub[0]['Status']")==='Approved',
   'and the status agrees — it used to finish still reading "Resubmitted"');
ok(/resubmitted/.test(html.match(/const WF_UNDECIDED=[^\n]*/)[0]),
   'because a resubmission is counted as nobody having decided yet');

console.log((bad?'FAIL ':'ok   ')+'tools-test-roundtrip.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
