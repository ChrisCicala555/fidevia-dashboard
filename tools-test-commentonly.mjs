// "Comment only no decision advanced the chain."
//
// It was sitting in the status list as an ordinary outcome, so it went down
// the same path as Approved: the reviewer's step was signed, the chain moved,
// and the item's Status became the sentence "Comment only — no decision". An
// engineer who wrote "Idk Architect u tell me" was on the record as having
// answered, and the architect's group counted them as done.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);

const seed=()=>P.run(`
  allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
    {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test'},
    {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'}];
  currentProject.config.workflows.sub=[{name:'Architect Review', company:'Architect 2'}];
  allData.sub=[{'Submittal #':'SUB-GC-008','Description':'FTW','Company':'Summit Builders',
    'Status':'Pending Review','Workflow Step':'0','Workflow Status':'In Review',
    'Version History':'[]','Workflow Signed':'','Workflow Extra':'','Workflow Done':''}];
  ccAddReviewSteps('sub', allData.sub[0], 'Next Level Engineers'); 1;`);

const asEng=`EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='p@y.test'; ME_NAME='Penelope Odiem';
  currentProject.userCompany='Next Level Engineers'; currentProject.userRole='engineer';`;
const asArch=`EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='a@x.test'; ME_NAME='Test Architect';
  currentProject.userCompany='Architect 2'; currentProject.userRole='architect';`;

const act=(who,route)=>{ P.run(who);
  return P.run(`openReply('sub',0,true);
    document.getElementById('reply-status').value=${JSON.stringify(route)}; replyStatusChanged();
    String(applyReviewAdvance('sub', allData.sub[0], ME_NAME));`); };
const signed=()=>P.run("JSON.stringify(wfSignedMap(allData.sub[0]))");
const cur=()=>P.run("allData.sub[0]['Workflow Step']");
const wstat=()=>P.run("allData.sub[0]['Workflow Status']");

console.log('What counts as a comment rather than a decision');
ok(P.run("wfIsCommentOnly('Comment only \\u2014 no decision')")===true, 'the entry in the list');
ok(P.run("wfIsCommentOnly('  comment only')")===true, 'however it is cased or spaced');
ok(P.run("wfIsCommentOnly('Approved')")===false, 'an approval is a decision');
ok(P.run("wfIsCommentOnly('Approved as Noted')")===false, 'so is an approval with comments');
ok(P.run("wfIsCommentOnly('Revise and Resubmit')")===false, 'so is a return');
ok(P.run("wfIsCommentOnly('')")===false && P.run("wfIsCommentOnly(null)")===false, 'nothing is not a comment');
ok(P.run("wfIsCommentOnly('No comment only')")===false, 'it has to be what was chosen, not contain the words');

console.log('A comment signs nothing and moves nothing');
seed();
const before=cur()+'|'+wstat()+'|'+signed();
ok(act(asEng,'Comment only — no decision')==='', 'nobody was added');
ok(signed()==='{}', 'the engineer is not recorded as having answered');
ok(cur()+'|'+wstat()+'|'+signed()===before, 'and nothing about the chain changed at all');

console.log('So the item still waits on the people it was waiting on');
ok(P.run("wfActiveIdx(allData.sub[0])")===0, 'the chain is still on the first group');
ok(P.run("JSON.stringify(wfMyStepsIn(wfEffectiveSteps('sub',allData.sub[0]),0,1))")!=='[]',
   'and the engineer is still one of the people it is with');

console.log('The item keeps the status it had')
ok(P.run("replyRowStatus('Comment only \u2014 no decision','Pending Review')")==='Pending Review',
   'a note about there being no decision does not become the decision');
ok(P.run("replyRowStatus('Comment only \u2014 no decision','Approved')")==='Approved',
   'and an approval already on the record is not undone by somebody commenting');
ok(P.run("replyRowStatus('Approved','Pending Review')")==='Approved', 'a real decision is written through');
ok(P.run("replyRowStatus('Revise and Resubmit','Approved')")==='Revise and Resubmit', 'including a return');
ok(/row\['Status'\]=replyRowStatus\(status, row\['Status'\]\);/.test(html),
   'and submitReply is what applies the rule');

console.log('A real decision still behaves as before');
seed();
act(asEng,'Approved');
ok(signed()!=='{}', 'an approval is recorded');
act(asArch,'Approved');
ok(wstat()==='Complete', 'and the chain still completes when everyone has answered');

console.log('The reviewer is told what happened');
ok(/Comment recorded\. No decision was made/.test(html), 'the message says no decision was made');
ok(!/_commentOnly\)\s*alert\('Review recorded/.test(html), 'and not that the chain moved');

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
