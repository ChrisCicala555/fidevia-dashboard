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
  // Sending it back is a status now, not a separate question: the one list is
  // the whole decision, and Revise and Resubmit routes the item by itself.
  ok(!/id="reply-action"/.test(html),
     'there is no second dropdown \u2014 four of its five answers were already implied by the status');
  ok(/Revise and Resubmit/.test(html), 'and sending it back is one of the statuses');
  const routes=Object.keys(JSON.parse('{}'));
  ok(/'__also':/.test(html) && /'__reassign':/.test(html),
     'while the two that no status can say are entries in the same list');
  ok(/return wfIsReturnOutcome\(t\) \? 'return' : 'continue';/.test(html),
     'and a return is read off the status itself, which is what it always was');
}

console.log('One control, so there is nothing to keep in step');
{
  ok(/onchange="replyStatusChanged\(\)"/.test(html),
     'the one dropdown drives everything');
  ok(!/replyActionSyncsStatus/.test(html),
     'and the code that kept two fields from contradicting each other is gone with the second field');
  const st = html.split('function replyStatusChanged')[1].split('\n// advance:')[0];
  ok(/const route=replyRouteOf\(v\);/.test(st), 'the one handler reads what was chosen');
  ok(/replySyncReturn\(replyDecidesHere\(\) && route==='return'\)/.test(st),
     'a return is still a return, read off the status the way it always was');
}

console.log('Returning names nobody')
{
  const st = html.split('function replyStatusChanged')[1].split('\n// advance:')[0];
  ok(/who\.style\.display = \(route==='also'\|\|route==='reassign'\) \? '' : 'none'/.test(st),
     'the person picker appears only for the two entries that need a name \u2014 a return goes to whoever '
     +'filed it, which is not a choice');
  ok(/This goes back to '\+replyReturnTarget\(\)/.test(html),
     'and the return note names them, which is where that sentence lives');
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
  for(const [label,pick] of [['the action',"document.getElementById('reply-status').value='Revise and Resubmit';"],
                             ['the status',"document.getElementById('reply-status').value='Revise and Resubmit';"]]){
    b.run(reset+`openReply('sub',0,true); ${pick}
      applyReviewAdvance('sub', allData.sub[0], 'Test Architect');`);
    const chain=JSON.parse(b.run("JSON.stringify(wfEffectiveSteps('sub',allData.sub[0]).map(s=>s.name))"));
    ok(chain[1]==='Revise and Resubmit', 'chosen via '+label+', a step appears for the submitter');
    ok(b.run("allData.sub[0]['Workflow Step']")==='1', 'and the item moves onto it');
  }
  // The contradiction that used to send it to a third party cannot arise now.
  // It took two fields to hold two answers: the status said Revise and
  // Resubmit while the action said hand it over, and the handover branch ran
  // first. One field holds one answer, so the last thing chosen is the answer
  // — and that is what happens.
  b.run(reset+`openReply('sub',0,true);
    document.getElementById('reply-status').value='Revise and Resubmit';
    document.getElementById('reply-status').value='__reassign';
    document.getElementById('reply-next').value='Somebody Else';
    applyReviewAdvance('sub', allData.sub[0], 'Test Architect');`);
  ok(/Somebody Else/.test(b.run("allData.sub[0]['Workflow Reassigned']||''")),
     'choosing the handover after the return does hand it over, because that is what was chosen last');
  const chain2=JSON.parse(b.run("JSON.stringify(wfEffectiveSteps('sub',allData.sub[0]).map(s=>s.name))"));
  ok(!chain2.includes('Revise and Resubmit'),
     'and no return step is added behind it \u2014 one field cannot hold both answers at once');
}
{
  const c = html.split('function applyReviewAdvance')[1].split('\nfunction ')[0];
  ok(/const _returning = act==='return';/.test(c),
     'so the branch reads one answer rather than reconciling two');
  ok(/if\(!_returning && act==='reassign' && pick\)\{/.test(c),
     'and the handover still yields to a return, which costs nothing and cannot now be reached');
}

console.log('Only the person choosing it is told what it does');
// The note is written in the second person — "it returns to you when they
// resubmit" — and the reader it appeared for was the contractor, who is the
// "they". They were told their own submittal was about to be sent to them, by
// them, because the row already said Revise and Resubmit and the dialog reads
// the status on open.
{
  const b2 = bootPage('index.html'); b2.run(SEED);
  const base=`allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
    {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'}];
  currentProject.config.workflows.sub=[{name:'Architect Review',person:'Test Architect',email:'a@x.test'}];
  allData.sub=[{'Submittal #':'SUB-GC-001','Description':'d','Submitted By (Sub)':'gc@s.test (Summit Builders)',
    'Company':'Summit Builders','Reviewer':'Architect 2','Status':'Revise and Resubmit','Workflow Step':'1',
    'Workflow Status':'In Review','Version History':'[]','Workflow Signed':'',
    'Workflow Extra':JSON.stringify([{after:0,name:'Revise and Resubmit',person:'Test Contractor',
      company:'Summit Builders',email:'gc@s.test',returned:true}])}];`;
  const noteFor=(email,co,role,ext,adm)=>{
    b2.run(base+`EXTERNAL=${ext};IS_ADMIN=${adm};ME_EMAIL='${email}';ME_COMPANY='${co}';
      currentProject.userCompany='${co}';currentProject.userRole='${role}';DATA_READY=true;openReply('sub',0,true);`);
    return b2.run("document.getElementById('reply-return-note').style.display")!=='none'; };
  ok(!noteFor('gc@s.test','Summit Builders','contractor',true,false),
     'the contractor revising it is not told it is about to be sent to them');
  ok(!noteFor('a@x.test','Architect 2','architect',true,false),
     'nor the architect, who already sent it and cannot decide again here');
  ok(!noteFor('cc@fidevia.com','Fidevia','',false,true),
     'nor Fidevia merely opening it — nobody has chosen anything yet');
  // But the reviewer who is choosing it, is.
  b2.run(base+`EXTERNAL=true;IS_ADMIN=false;ME_EMAIL='a@x.test';ME_COMPANY='Architect 2';
    currentProject.userCompany='Architect 2';currentProject.userRole='architect';
    allData.sub[0]['Workflow Step']='0'; allData.sub[0]['Status']='Pending Review';
    allData.sub[0]['Workflow Extra']=''; DATA_READY=true; openReply('sub',0,true);
    document.getElementById('reply-status').value='Revise and Resubmit'; replyStatusChanged();`);
  ok(b2.run("document.getElementById('reply-return-note').style.display")!=='none',
     'the reviewer choosing to send it back is');
  ok(/This goes back to Test Contractor/.test(b2.run("document.getElementById('reply-return-note').textContent")),
     'and told who to');
}
ok(/replySyncReturn\(replyDecidesHere\(\) && route==='return'\)/.test(html),
   'a status the reader cannot change is not a choice they are making \u2014 the row arrived that way');
ok(/const show = returning && replyDecidesHere\(\);/.test(html),
   'and the note follows the same rule');

console.log((bad?'FAIL ':'ok   ')+'tools-test-returnaction.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
