// Reviewing the same step twice is allowed, and should be: a reviewer may
// change their mind, or the document may have been revised since. What was
// missing was being told. Christopher approved a change order, then approved it
// again, and nothing in the dialog said the first approval existed — so two
// approvals land on the record with no indication that the second was
// deliberate.
//
// This is a notice, not a block. The guard that DOES block — acting on a step
// that is not with you at all — is separate and stays.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);

// A change order part-way through a parallel review group, with Fidevia's
// review already recorded and the architect's still outstanding.
const ROW = `{
  'CO #':'', 'PCO #':'PCO-GC-001', 'Company':'Summit Builders',
  'Workflow Step':'0', 'Workflow Status':'In Review',
  'Workflow Signed':JSON.stringify({'0':{by:'cc@fidevia.com', at:'2026-09-10'}})
}`;
R(`WF=[{name:'Fidevia Review',person:'Christopher Cicala',email:'cc@fidevia.com',company:'Fidevia'},
      {name:'Architect Review',person:'Test Architect',email:'a@x.test',company:'Architect 2',parallel:true}];
   currentProject.config.workflows.co=WF;`);

console.log('Knowing a review is already on record');
{
  const prev = JSON.parse(R(`JSON.stringify(replyAlreadyReviewed('co',${ROW}))`));
  ok(prev && prev.mine===true, 'my own review is recognised as mine');
  ok(prev.step==='Fidevia Review', 'named by the step it was recorded against');
  ok(prev.at==='2026-09-10', 'with the date it was recorded');
  ok(prev.outcome==='Approved', 'and what was decided, defaulting to approval');
}
{
  const other = `{'PCO #':'P1','Company':'Summit Builders','Workflow Step':'0','Workflow Status':'In Review',
    'Workflow Signed':JSON.stringify({'1':{by:'a@x.test', at:'2026-09-10'}})}`;
  ok(R(`replyAlreadyReviewed('co',${other})`)===null,
     'the architect’s review in the same group is not reported to me as mine');
}
{
  // Anyone at the firm can act on the firm's step, so anyone at the firm having
  // acted is worth saying — it is the same rule, read the other way.
  R(`ME_EMAIL='other@fidevia.com'; ME_NAME='Someone Else'; ME_COMPANY='Fidevia';`);
  const prev = JSON.parse(R(`JSON.stringify(replyAlreadyReviewed('co',${ROW}))`));
  ok(prev && prev.mine===false, 'a colleague’s review is reported, and not claimed as mine');
  ok(prev.by==='cc@fidevia.com', 'naming who actually recorded it');
  R(`ME_EMAIL='cc@fidevia.com'; ME_NAME='Christopher Cicala'; ME_COMPANY='Fidevia';`);
}
{
  const fresh = `{'PCO #':'P2','Company':'Summit Builders','Workflow Step':'0','Workflow Status':'In Review'}`;
  ok(R(`replyAlreadyReviewed('co',${fresh})`)===null, 'nothing is claimed when nothing has been signed');
  ok(R(`replyAlreadyReviewed('co',null)`)===null, 'and an absent row says nothing rather than throwing');
}
{
  // Only the group being acted on. An approval two steps back is history, not a
  // warning about what is being done now. Steps 0 and 1 are one parallel group
  // here, so the separate step is 2.
  R(`currentProject.config.workflows.co=WF.concat([{name:'Owner Sign',person:'Sophie Hinkle',email:'s@o.test',company:'Ithaca'}]);`);
  const later = `{'PCO #':'P3','Company':'Summit Builders','Workflow Step':'2','Workflow Status':'In Review',
    'Workflow Signed':JSON.stringify({'0':{by:'cc@fidevia.com', at:'2026-09-10'}})}`;
  ok(R(`replyAlreadyReviewed('co',${later})`)===null,
     'a review recorded against an earlier group is not raised against a later step');
  // ...but within one parallel group it still counts, because that group is
  // what is being acted on.
  const sameGroup = `{'PCO #':'P3b','Company':'Summit Builders','Workflow Step':'1','Workflow Status':'In Review',
    'Workflow Signed':JSON.stringify({'0':{by:'cc@fidevia.com', at:'2026-09-10'}})}`;
  ok(R(`replyAlreadyReviewed('co',${sameGroup})!==null`),
     'while one recorded elsewhere in the same parallel group does count — that group is the step being acted on');
  R(`currentProject.config.workflows.co=WF;`);
}
{
  const sentBack = `{'PCO #':'P4','Company':'Summit Builders','Workflow Step':'0','Workflow Status':'In Review',
    'Workflow Signed':JSON.stringify({'0':{by:'cc@fidevia.com', at:'2026-09-10', outcome:'Revise and Resubmit'}})}`;
  ok(R(`replyAlreadyReviewed('co',${sentBack}).outcome`)==='Revise and Resubmit',
     'and an outcome other than approval is reported as what it was, not as an approval');
}

console.log('What the dialog says');
{
  const d = html.split("{ const an=document.getElementById('reply-again-note');")[1].split('} }')[0];
  ok(/already reviewed this/.test(d), 'it says a review is already on record');
  ok(/prev\.mine\?'You have':esc\(prev\.by\)\+' has'/.test(d),
     'in the first person when it was mine, and naming the colleague when it was not');
  ok(/Submitting again records a second review/.test(d), 'and says plainly what pressing submit will do');
  ok(/\+\(prev\.at\?\(' on '\+esc\(fmtDMY\(prev\.at\)\)\):''\)/.test(d),
     'and when it was recorded — "you already reviewed this" without a date leaves the reader wondering whether it was a moment ago or last month');
  ok(/which is right if the document has changed or you have/.test(d),
     'without implying it is a mistake — it often is not');
  ok(/The earlier one stays in the history either way/.test(d),
     'and says the first is not overwritten, which is the question anybody would have');
  ok(/const prev=_decides \? replyAlreadyReviewed\(key, r\) : null/.test(d),
     'shown only to somebody whose decision it is — a contractor is not being told about a reviewer’s approval');
}
ok(/id="reply-again-note"/.test(html), 'the dialog has somewhere to put it');
{
  const closed = html.indexOf("id=\"reply-closed-note\"");
  const again = html.indexOf("id=\"reply-again-note\"");
  ok(closed>=0 && again>closed, 'sitting below the closed-item notice, which is the more serious of the two');
}

console.log('It notifies rather than blocks');
{
  const d = html.split("{ const an=document.getElementById('reply-again-note');")[1].split('} }')[0];
  ok(!/disabled/.test(d) && !/return;/.test(d),
     'nothing is disabled and nothing returns early — a second review is still allowed');
}
ok(/function replyStepIsMine/.test(html) && /function replyClosedReason/.test(html),
   'while the guards that do refuse — whose step it is, and whether it is closed — are untouched');

console.log((bad?'FAIL ':'ok   ')+'tools-test-reviewagain.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
