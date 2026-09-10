// A decision belongs to whoever the chain is on. The architect who sends a
// submittal back can send it back again — and again — because the status field
// was shown to any design role regardless of whose step it was. Each press
// overwrote the status and added a version while the chain sat with the
// contractor, so the record carried two returns from somebody it was no longer
// with.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const reset=()=>b.run(`allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
  {'Name':'Gorilla PM','Company':'Gorilla Construction','Email':'g@g.test'}];
currentProject.config.workflows.sub=[{name:'Architect Review',person:'Test Architect',email:'a@x.test'}];
allData.sub=[{'Submittal #':'SUB-GO-001','Description':'Wall','Submitted By (Sub)':'g@g.test (Gorilla Construction)',
  'Company':'Gorilla Construction','Reviewer':'Architect 2','Status':'Pending Review',
  'Workflow Step':'0','Workflow Status':'In Review','Version History':'[]','Workflow Extra':'','Workflow Signed':''}];`);
const as=(email,co,role,ext,adm)=>b.run(`EXTERNAL=${ext};IS_ADMIN=${adm};ME_EMAIL='${email}';ME_NAME='';
  ME_COMPANY='${co}';currentProject.userCompany='${co}';currentProject.userRole='${role}';DATA_READY=true;`);
const opened=()=>{ b.run("openReply('sub',0,true)");
  return { decides: b.run("document.getElementById('reply-status-field').style.display")!=='none',
           note: b.run("document.getElementById('reply-status-note').style.display")==='none' ? ''
                 : b.run("document.getElementById('reply-status-note').textContent") }; };

console.log('Sending it back, twice');
reset(); as('a@x.test','Architect 2','architect',true,false);
ok(opened().decides, 'the architect may decide while the chain is on them');
b.run(`document.getElementById('reply-action').value='continue';
  document.getElementById('reply-status').value='Revise and Resubmit';
  applyReviewAdvance('sub', allData.sub[0], 'Test Architect');
  allData.sub[0]['Status']='Revise and Resubmit';`);
ok(b.run("allData.sub[0]['Workflow Step']")==='1', 'and the return moves it to the contractor');
{
  const second=opened();
  ok(!second.decides, 'the second time round they cannot decide again — it is no longer theirs');
  ok(/This is with Gorilla PM \(Gorilla Construction\)/.test(second.note),
     'and are told who it is with ('+second.note.slice(0,60)+')');
  ok(/add a version or a note/.test(second.note),
     'and what they can still do, so it is a redirection rather than a locked door');
}
// The status they cannot set is not quietly set for them either.
{
  b.run(`allData.sub[0]['Status']='Revise and Resubmit';
    document.getElementById('reply-note').value='another look';`);
  const c = html.split('async function submitReply')[1].split('\n// Completing a review')[0];
  ok(/replyIsSubmitterSide\(key,_row0\)[^?]*\? 'Resubmitted'/.test(c)
     && /: String\(_row0\['Status'\]\|\|''\)/.test(c),
     'somebody who cannot decide leaves the status where the last decision left it');
  ok(!/_canDecide \? document\.getElementById\('reply-status'\)\.value : 'Resubmitted'/.test(c),
     'rather than stamping Resubmitted over it, which is what a reviewer would have done');
}

console.log('Who decides at all');
reset(); as('g@g.test','Gorilla Construction','contractor',true,false);
{
  const gc=opened();
  ok(!gc.decides, 'a contractor never sets the status, even on a step that is theirs');
  ok(gc.note==='', 'and is not lectured about it — they were never deciding');
}
reset();
b.run(`allData.sub[0]['Workflow Step']='1';
  allData.sub[0]['Workflow Extra']=JSON.stringify([{after:0,name:'Revise and Resubmit',person:'Gorilla PM',
    company:'Gorilla Construction',email:'g@g.test',returned:true}]);
  allData.sub[0]['Status']='Revise and Resubmit';`);
as('g@g.test','Gorilla Construction','contractor',true,false);
ok(!opened().decides,
   'nor on a returned step — answering a return is resubmitting, not ruling on your own submittal');
reset(); as('cc@fidevia.com','Fidevia','',false,true);
ok(opened().decides, 'Fidevia keeps it — acting on somebody else’s step is the documented override');

console.log('The rule');
{
  const _fn = html.split('function openReply')[1];
  const c = _fn.slice(0, _fn.indexOf('\nfunction '));
  ok(/const _mineNow = replyStepIsMine\(key, r\);/.test(c), 'whose step it is');
  ok(/const _reviews = !EXTERNAL \|\| DESIGN_ROLES\.includes\(viewingAsRole\(\)\);/.test(c),
     'and whether the reader decides at all');
  ok(/const _decides = \(_mineNow && _reviews\) \|\| \(IS_ADMIN && !viewingAsExternal\(\)\);/.test(c),
     'both required — dropping either one hands somebody a decision that is not theirs');
  // Both fields are halves of the same act, and one of them used to answer a
  // looser question: an architect told the decision was not theirs to record
  // was asked, immediately below, which kind of review they were recording.
  ok(/nf\.style\.display = \(advance && _decides\) \? '' : 'none';/.test(c),
     'and the same answer governs "What are you doing?" as governs the status');
  ok(/if\(sf\) sf\.style\.display = _decides \? '' : 'none';/.test(c),
     'computed once rather than twice, so they cannot drift apart');
}
{
  const c = html.split('function replyStepIsMine')[1].split('\n// The reader is the side')[0];
  ok(/const \[gs,ge\]=wfGroupAt\(steps, wfActiveIdx\(row\)\);/.test(c),
     'it asks about the current group, not the whole chain');
  ok(/if\(!steps\.length\) return true;/.test(c), 'an item with no chain has no step to be off');
  ok(/if\(wfIsDone\(row\)\|\|wfIsStopped\(row\)\) return false;/.test(c),
     'and a finished or killed chain is nobody’s to decide');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-decideguard.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
