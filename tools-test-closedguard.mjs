// Adding to something already settled. An approved submittal with its workflow
// complete took a new version without a word, and the version flipped it to
// Resubmitted while the chain still read complete — the two halves of the
// record disagreeing in public.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
b.run(`allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
  {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'}];
currentProject.config.workflows.sub=[{name:'Architect Review',person:'Test Architect',email:'a@x.test'}];`);
const row=(extra)=>b.run(`allData.sub=[Object.assign({'Submittal #':'SUB-GC-001','Description':'Panels',
  'Submitted By (Sub)':'gc@s.test (Summit Builders)','Company':'Summit Builders','Reviewer':'Architect 2',
  'Version History':'[]','Workflow Extra':''}, ${extra})];`);
const asGC=()=>b.run(`EXTERNAL=true;IS_ADMIN=false;ME_EMAIL='gc@s.test';ME_COMPANY='Summit Builders';
  currentProject.userCompany='Summit Builders';currentProject.userRole='contractor';DATA_READY=true;`);
const banner=()=>{ b.run("openReply('sub',0,false)");
  return b.run("document.getElementById('reply-closed-note').style.display")!=='none'
    ? b.run("document.getElementById('reply-closed-note').innerHTML").replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim() : ''; };
const DONE=`{'Status':'Approved','Workflow Step':'0','Workflow Status':'Complete',
  'Workflow Signed':JSON.stringify({'0':{by:'Test Architect',at:'2026-09-09'}})}`;

console.log('It says so before you type');
row(DONE); asGC();
{
  const t=banner();
  ok(/This submittal is closed/.test(t), 'a finished item says it is closed');
  ok(/workflow finished on 09\/09\/2026/.test(t), 'when it finished');
  ok(/stands as Approved/.test(t), 'and what it stands as');
  ok(/does not reopen the review/.test(t), 'and what adding to it will and will not do');
}
row(`{'Status':'Rejected','Workflow Step':'0','Workflow Status':'Rejected'}`); asGC();
ok(/It was marked Rejected/.test(banner()), 'an item decided against says that instead');
row(`{'Status':'Pending Review','Workflow Step':'0','Workflow Status':'In Review'}`); asGC();
ok(banner()==='', 'and a live item says nothing at all');

console.log('And asks before it writes');
row(DONE); asGC();
b.run("openReply('sub',0,false); window.__q=''; window.confirm=(m)=>{window.__q=m; return false;}; document.getElementById('reply-note').value='Blah';");
await b.run("submitReply()");
{
  const q=b.run("window.__q");
  ok(/already closed/.test(q), 'the confirmation says the item is closed');
  ok(/Add it anyway\?/.test(q), 'and asks whether that is intended');
  ok(/the decision on file stays as it is/.test(q), 'and is honest about what will happen');
  ok(b.run("allData.sub[0]['Status']")==='Approved', 'declining leaves the decision alone');
  ok(JSON.parse(b.run("JSON.stringify(_versions(allData.sub[0]))")).length===1,
     'and adds no version');
  ok(b.run("document.getElementById('reply-backdrop').classList.contains('open')")===true,
     'the dialog stays open rather than swallowing the attempt');
}
// A live item is not interrupted.
row(`{'Status':'Pending Review','Workflow Step':'0','Workflow Status':'In Review'}`); asGC();
b.run("openReply('sub',0,false); window.__q=''; window.confirm=(m)=>{window.__q=m; return false;};");
await b.run("submitReply()");
ok(b.run("window.__q")==='', 'and nothing is asked when the item is still open');

console.log('Filing against a closed record does not restate the outcome');
{
  const c = html.split('async function submitReply')[1].split('\n// Completing a review')[0];
  ok(/const _closed=!!replyClosedReason\(key,_row0\);/.test(c), 'the write knows the item is settled');
  ok(/\(replyIsSubmitterSide\(key,_row0\) && !_closed\) \? 'Resubmitted'/.test(c),
     'so the submitter’s version stops being recorded as a resubmission of a finished review');
  ok(/if\(why && !confirm\(/.test(c), 'and the guard runs before anything is written');
}
{
  const c = html.split('function replyClosedReason')[1].split('\nfunction closeReply')[0];
  ok(/if\(wfIsStopped\(row\)\)/.test(c) && /if\(wfIsDone\(row\)\)/.test(c),
     'both ways of being settled count — finished, and decided against');
  ok(/return '';/.test(c), 'and a live item has no reason, which is what the callers test');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-closedguard.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
