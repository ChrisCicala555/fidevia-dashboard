// Sending something back is one of the things a reviewer does with a step, so
// it belongs in the list of things a reviewer does with a step.
//
// It was only ever a status, and the two controls could contradict each other:
// Revise and Resubmit chosen while the action still read "the chain moves on as
// configured" — a sentence that was not true. Worse, "handing this step to
// somebody else" was acted on *instead* of the return, so the status said
// Revise and Resubmit while the chain went to a third party.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

console.log('It is in the list');
{
  const blk = html.split('id="reply-action"')[1].split('</select>')[0];
  const opts = (blk.match(/<option value="([^"]+)"/g)||[]).map(x=>x.replace(/.*value="/,'').replace('"',''));
  ok(opts.length===4, 'four things a reviewer can do ('+opts.join(', ')+')');
  ok(opts.includes('return'), 'including sending it back');
  ok(/Sending it back to be revised and resubmitted/.test(blk), 'said in the reviewer’s words');
  ok(opts[3]==='return', 'last, after the three that carry on');
}

console.log('The two controls stay in step');
{
  ok(/onchange="replyActionSyncsStatus\(\);replyActionChanged\(\)"/.test(html),
     'changing the action updates the status');
  ok(/onchange="replyStatusChanged\(\)"/.test(html), 'and changing the status updates the action');
  const a = html.split('function replyActionSyncsStatus')[1].split('\nfunction ')[0];
  ok(/const hit=\[\.\.\.sel\.options\]\.find\(o=>wfIsReturnOutcome\(o\.value\)\)/.test(a),
     'picking return selects the returning status');
  ok(/} else if\(wfIsReturnOutcome\(sel\.value\)\)\{/.test(a),
     'and moving off return clears it, so the pair cannot be left disagreeing');
  const st = html.split('function replyStatusChanged')[1].split('\n// The action was changed')[0];
  ok(/if\(returning\) act\.value=REPLY_RETURN_ACTION;/.test(st), 'and the same in reverse');
  ok(/else if\(act\.value===REPLY_RETURN_ACTION\) act\.value='continue';/.test(st), 'both ways');
}

console.log('Returning names nobody');
{
  const c = html.split('function replyActionChanged')[1].split('\nfunction ')[0];
  ok(/act==='continue'\|\|act===REPLY_RETURN_ACTION/.test(c),
     'the person picker is hidden — it goes to whoever filed it, which is not a choice');
  ok(/It goes back to '\+replyReturnTarget\(\)/.test(c), 'and the hint names them');
}

console.log('And the chain actually goes back, chosen either way');
{
  const b = bootPage('index.html'); b.run(SEED);
  const reset=`allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
    {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'}];
  currentProject.config.workflows.sub=[{name:'Architect Review',person:'Test Architect',email:'a@x.test'}];
  allData.sub=[{'Submittal #':'SUB-GC-001','Description':'d','Submitted By (Sub)':'gc@s.test (Summit Builders)',
    'Company':'Summit Builders','Reviewer':'Architect 2','Status':'Pending Review','Workflow Step':'0',
    'Workflow Status':'In Review','Version History':'[]','Workflow Extra':'','Workflow Signed':''}];
  EXTERNAL=true;IS_ADMIN=false;ME_EMAIL='a@x.test';ME_COMPANY='Architect 2';
  currentProject.userCompany='Architect 2';currentProject.userRole='architect';DATA_READY=true;`;
  for(const [label,pick] of [['the action',"document.getElementById('reply-action').value='return';"],
                             ['the status',"document.getElementById('reply-status').value='Revise and Resubmit';"]]){
    b.run(reset+`openReply('sub',0,true); ${pick}
      applyReviewAdvance('sub', allData.sub[0], 'Test Architect');`);
    const chain=JSON.parse(b.run("JSON.stringify(wfEffectiveSteps('sub',allData.sub[0]).map(s=>s.name))"));
    ok(chain[1]==='Revise and Resubmit', 'chosen via '+label+', a step appears for the submitter');
    ok(b.run("allData.sub[0]['Workflow Step']")==='1', 'and the item moves onto it');
  }
  // The contradiction that used to send it to a third party.
  b.run(reset+`openReply('sub',0,true);
    document.getElementById('reply-status').value='Revise and Resubmit';
    document.getElementById('reply-action').value='reassign';
    document.getElementById('reply-next').value='Somebody Else';
    applyReviewAdvance('sub', allData.sub[0], 'Test Architect');`);
  const chain=JSON.parse(b.run("JSON.stringify(wfEffectiveSteps('sub',allData.sub[0]).map(s=>s.name))"));
  ok(chain[1]==='Revise and Resubmit',
     'and a status of Revise and Resubmit wins over a stale handover — it does not go to a third party');
  ok(!/Somebody Else/.test(b.run("allData.sub[0]['Workflow Reassigned']||''")),
     'with nobody reassigned behind the reader’s back');
}
{
  const c = html.split('function applyReviewAdvance')[1].split('\nfunction ')[0];
  ok(/const _returning = act===REPLY_RETURN_ACTION \|\| wfIsReturnOutcome\(_outcome0\);/.test(c),
     'either control can say it');
  ok(/if\(!_returning && act==='reassign' && pick\)\{/.test(c),
     'and it is settled before the handover branch, which is what made them contradict');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-returnaction.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
