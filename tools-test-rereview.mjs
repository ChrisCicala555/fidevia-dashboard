// "I did an additional review from the engineer passing it off to the
// architect and it still results in this" — the architect never came back.
//
// The chain is rebuilt from the record every time it is read, and an added
// step is anchored by an index into the BASE workflow. Every caller passed an
// index into the REBUILT chain instead, so on a short workflow the anchor
// overshot, clamped to the end, and added steps settled in whatever order the
// sort happened to splice them. The visible symptom: after a revision came
// back, the cursor sat on the contractor's own returned step, so the reviewer
// acting on the item matched no step of theirs, and every action they took
// wrote nothing at all — while the panel went on saying it was with them.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');

const P=bootPage(); P.run(SEED);
const seed=()=>P.run(`
  allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
    {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test'},
    {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'},
    {'Name':'Owner Rep','Company':'Fidevia','Email':'o@f.test'}];
  currentProject.config.workflows.sub=[{name:'Architect Review', company:'Architect 2'}];
  allData.sub=[{'Submittal #':'S','Description':'d','Company':'Summit Builders',
    'Status':'Pending Review','Workflow Step':'0','Workflow Status':'In Review',
    'Version History':'[]','Workflow Signed':'','Workflow Extra':'','Workflow Done':''}];
  ccAddReviewSteps('sub', allData.sub[0], 'Next Level Engineers'); 1;`);

const AS={
  eng:`EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='p@y.test'; ME_NAME='Penelope Odiem';
       currentProject.userCompany='Next Level Engineers'; currentProject.userRole='engineer';`,
  gc:`EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='gc@s.test'; ME_NAME='Test Contractor';
      currentProject.userCompany='Summit Builders'; currentProject.userRole='contractor';`,
  arch:`EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='a@x.test'; ME_NAME='Test Architect';
        currentProject.userCompany='Architect 2'; currentProject.userRole='architect';`,
  own2:`EXTERNAL=false; IS_ADMIN=true; ME_EMAIL='o@f.test'; ME_NAME='Owner Rep';
        currentProject.userCompany='Fidevia'; currentProject.userRole='owner';`};

const act=(who,route,pick)=>{ P.run(AS[who]);
  return P.run(`openReply('sub',0,true);
    document.getElementById('reply-status').value=${JSON.stringify(route)}; replyStatusChanged();
    document.getElementById('reply-next').value=${JSON.stringify(pick||'')};
    String(applyReviewAdvance('sub', allData.sub[0], ME_NAME));`); };
const chain=()=>JSON.parse(P.run(`JSON.stringify(wfEffectiveSteps('sub',allData.sub[0])
  .map(function(s){return (s.name||'')+'/'+(wfStepCompany(s)||s.person||'');}))`));
const cur=()=>parseInt(P.run("allData.sub[0]['Workflow Step']"),10);
const status=()=>P.run("allData.sub[0]['Workflow Status']");

console.log('An anchor is a base-chain index, not a rebuilt-chain one');
seed();
ok(P.run("wfBaseAnchor([{},{added:true},{added:true},{}], 3)")===1,
   'three steps in, only two of them base, so the anchor is 1');
ok(P.run("wfBaseAnchor([{},{added:true}], 1)")===0,
   'an added step does not advance the anchor');
ok(P.run("wfBaseAnchor([], 5)")===-1, 'nothing to anchor to');
ok(P.run("wfBaseAnchor(null, 2)")===-1, 'no chain at all is not a crash');
ok(P.run("wfBaseAnchor([{},{},{}], 99)")===2,
   'an index past the end anchors to the last base step, not beyond it');

console.log('The revision comes back to the reviewer who sent it back');
seed();
act('eng','Revise and Resubmit');
ok(chain()[cur()]==='Revise and Resubmit/Summit Builders',
   'it sits with the contractor while they revise');
act('gc','Resubmitted');
ok(chain()[cur()]==='Additional Review/Next Level Engineers',
   'and comes back to the engineer, not to the contractor step it was just at');
ok(chain()[cur()-1]==='Revise and Resubmit/Summit Builders',
   'the re-review is after the return, so the chain reads in the order it happened');

console.log('And the reviewer can still send it on');
const added=act('eng','__also','Architect 2');
ok(added==='Architect 2', 'the architect was added — the call used to write nothing');
ok(chain()[cur()]==='Further Review/Architect 2', 'and the item is now with them');
ok(chain().filter(s=>s==='Further Review/Architect 2').length===1, 'once, not twice');
ok(status()==='In Review', 'still open until they answer');

console.log('The architect closes it out');
act('arch','Approved');
ok(status()==='Complete', 'the chain ends with the architect, who takes the final action');
ok(chain()[cur()]==='Further Review/Architect 2', 'on their own step');

console.log('A plain approval still just moves along');
seed();
P.run(`currentProject.config.workflows.sub=[{name:'Architect Review', company:'Architect 2'},
                                           {name:'Owner Review', company:'Fidevia'}];
       allData.sub[0]['Workflow Extra']='';`);
act('arch','Approved');
ok(cur()===1, 'no added step, so it advances by one');
ok(chain().length===2, 'and nothing was inserted');

console.log('Two reviewers added on the same anchor keep their order');
seed();
P.run(`ccAddReviewSteps('sub', allData.sub[0], 'Summit Builders'); 1;`);
const c=chain();
ok(c[1]==='Additional Review/Next Level Engineers' && c[2]==='Additional Review/Summit Builders',
   'the second one added is listed second');

console.log('A longer chain, where the return comes from the last step');
// One base step hid all of this: with only one step to anchor to, every
// arithmetic guess about where a step landed happened to be right. Two base
// steps and a return from the second one is where the guesses come apart.
P.run(`allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
    {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test'},
    {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'},
    {'Name':'Owner Rep','Company':'Fidevia','Email':'o@f.test'}];
  currentProject.config.workflows.sub=[{name:'Architect Review', company:'Architect 2'},
                                       {name:'Owner Review', company:'Fidevia'}];
  allData.sub=[{'Submittal #':'S','Description':'d','Company':'Summit Builders',
    'Status':'Pending Review','Workflow Step':'0','Workflow Status':'In Review',
    'Version History':'[]','Workflow Signed':'','Workflow Extra':'','Workflow Done':''}];
  ccAddReviewSteps('sub', allData.sub[0], 'Next Level Engineers'); 1;`);
const AS_own=`EXTERNAL=false; IS_ADMIN=true; ME_EMAIL='o@f.test'; ME_NAME='Owner Rep';
              currentProject.userCompany='Fidevia'; currentProject.userRole='owner';`;
ok(chain().join(' | ')==='Architect Review/Architect 2 | Additional Review/Next Level Engineers | Owner Review/Fidevia',
   'the added reviewer sits beside the architect, ahead of the owner');
act('arch','Approved'); act('eng','Approved');
ok(chain()[cur()]==='Owner Review/Fidevia', 'both of the first group answered, so it moves to the owner');
P.run(AS_own);
P.run(`openReply('sub',0,true);
  document.getElementById('reply-status').value='Revise and Resubmit'; replyStatusChanged();
  applyReviewAdvance('sub', allData.sub[0], ME_NAME);`);
ok(chain()[cur()]==='Revise and Resubmit/Summit Builders', 'the owner sends it back');
ok(chain().join(' | ').endsWith('Owner Review/Fidevia | Revise and Resubmit/Summit Builders'),
   'and that step goes after the owner, not back up beside the architect');
act('gc','Resubmitted');
ok(chain()[cur()]==='Owner Review/Fidevia' && cur()===4,
   'the revision returns to the owner who objected, not to the step before them');
const added2=act('own2','__also','Architect 2');
ok(added2==='Architect 2', 'the owner sends it on to the architect');
ok(chain()[cur()]==='Further Review/Architect 2', 'and it is with the architect');
ok(chain().join(' | ').endsWith('Revise and Resubmit/Summit Builders | Owner Review/Fidevia | Further Review/Architect 2'),
   'added last, so it reads last');

console.log('A reviewer acting after their group already sent the item back');
// The added step is anchored to the base step the group belongs to, so it
// lands after everything already hanging off that step — including the
// return. "One past the end of the group" names the return instead, which
// would park the item on the contractor's own step and strand it there.
P.run(`allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
   {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test'},
   {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'},
   {'Name':'Owner Rep','Company':'Fidevia','Email':'o@f.test'}];
 currentProject.config.workflows.sub=[{name:'Architect Review', company:'Architect 2'},
                                      {name:'Owner Review', company:'Fidevia'}];
 allData.sub=[{'Submittal #':'S','Description':'d','Company':'Summit Builders',
   'Status':'Pending Review','Workflow Step':'0','Workflow Status':'In Review',
   'Version History':'[]','Workflow Signed':'','Workflow Done':'[1]',
   'Workflow Extra':JSON.stringify([
     {after:0,name:'Additional Review',company:'Next Level Engineers',parallel:true,added:true},
     {after:0,name:'Revise and Resubmit',person:'Test Contractor',company:'Summit Builders',returned:true}
   ])}]; 1;`);
ok(act('arch','__also','Fidevia')==='Fidevia', 'the architect sends it on');
ok(chain()[cur()]==='Further Review/Fidevia',
   'the cursor follows the step that was added, not the return sitting in between');
ok(cur()===3, 'which is where it landed, not one past the group');

console.log('The same firm added twice');
// Both entries carry the same day stamp, so "the first one that matches" is
// the step they already answered. It has to be the one that was not there
// before.
seed();
P.run(`allData.sub[0]['Workflow Extra']='';`);   // architect alone, no parallel group
act('arch','__also','Fidevia');
ok(chain()[cur()]==='Further Review/Fidevia', 'added once');
P.run(`ME_EMAIL='o@f.test'; ME_NAME='Owner Rep'; currentProject.userCompany='Fidevia';
       currentProject.userRole='owner'; EXTERNAL=true; IS_ADMIN=false;
       openReply('sub',0,true);
       document.getElementById('reply-status').value='__also'; replyStatusChanged();
       document.getElementById('reply-next').value='Next Level Engineers';
       String(applyReviewAdvance('sub', allData.sub[0], ME_NAME));`);
const back=act('eng','__also','Fidevia');
ok(back==='Fidevia', 'and added again by somebody else');
ok(cur()===chain().length-1, 'the cursor goes to the new step, not the one they already answered');
ok(chain().filter(x=>x==='Further Review/Fidevia').length===2, 'both entries are in the chain');

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
