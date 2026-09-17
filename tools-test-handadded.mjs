// "Handed this over to the owner and dont see anything."
//
// Because the step handed over was a re-review — an added step — and a
// handover was recorded by position into the BASE workflow, which only has the
// steps the project was set up with. The key matched nothing, the chain was
// rebuilt without it, and the reviewer was told it had worked.
//
// The third time the same mistake has shown up: an index into the rebuilt
// chain used against the base one. Fixed here by giving every step the store
// it came from, so a handover is recorded against the thing itself rather than
// against wherever it happened to be sitting.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P=bootPage('index.html'); P.run(SEED);

const seed=()=>P.run(`
 allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test','Notify - Submittal':'Yes'},
   {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test','Notify - Submittal':'Yes'},
   {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'},
   {'Name':'Owner Rep','Company':'Fidevia','Email':'o@f.test','Notify - Submittal':'Yes'}];
 currentProject.config.workflows.sub=[{name:'Architect Review', company:'Architect 2'},
                                     {name:'Engineer Review', company:'Next Level Engineers'}];
 allData.sub=[{'Submittal #':'S','Description':'d','Company':'Summit Builders','Status':'Pending Review',
   'Workflow Step':'0','Workflow Status':'In Review','Version History':'[]','Workflow Signed':'',
   'Workflow Extra':'','Workflow Done':'','Workflow Reassigned':''}]; 1;`);
const act=(em,nm,co,role,route,pick)=>P.run(`EXTERNAL=true;IS_ADMIN=false;ME_EMAIL='${em}';ME_NAME='${nm}';
  currentProject.userCompany='${co}';currentProject.userRole='${role}';
  openReply('sub',0,true);
  document.getElementById('reply-status').value=${JSON.stringify(route)}; replyStatusChanged();
  document.getElementById('reply-next').value=${JSON.stringify(pick||'')};
  String(applyReviewAdvance('sub', allData.sub[0], ME_NAME));`);
const steps=()=>JSON.parse(P.run("JSON.stringify(wfEffectiveSteps('sub',allData.sub[0]))"));
const cur=()=>parseInt(P.run("allData.sub[0]['Workflow Step']"),10);
const firm=i=>P.run(`wfStepCompany(wfEffectiveSteps('sub',allData.sub[0])[${i}])`);

console.log('Every step says which store it came from');
seed();
{
  const st=steps();
  ok(st[0]._base===0 && st[1]._base===1, 'the project’s own steps carry their base position');
  ok(st.every(s=>s._ex===undefined), 'and none of them claims to be an added step');
}
act('a@x.test','Test Architect','Architect 2','architect','Revise and Resubmit');
{
  const st=steps();
  ok(st[1]._ex===0, 'an added step carries which stored entry it came from');
  ok(st[1]._base===undefined, 'and no base position, because it has none');
}

console.log('Handing over an added step');
seed();
act('a@x.test','Test Architect','Architect 2','architect','Revise and Resubmit');
act('gc@s.test','Test Contractor','Summit Builders','contractor','Resubmitted');
ok(cur()===2 && firm(2)==='Architect 2', 'the revision comes back to the architect as an added step');
ok(act('a@x.test','Test Architect','Architect 2','architect','__reassign','Fidevia')==='',
   'they hand it to Fidevia');
ok(firm(2)==='Fidevia', 'and the step is now Fidevia’s — it used to be silently dropped');
{
  const s2=steps()[2];
  ok(s2.reassigned===true, 'marked as a handover');
  ok(s2.reassignedFrom==='Architect 2', 'naming who it came from');
  ok(s2.reassignedBy==='Test Architect', 'and who handed it over');
}
ok(P.run("allData.sub[0]['Workflow Reassigned']")==='' || P.run("allData.sub[0]['Workflow Reassigned']")==='{}',
   'nothing was written into the store that does not own this step');
ok(steps().length===4, 'and no step was invented or lost');

console.log('The firm it went to can act on it');
P.run("EXTERNAL=true;IS_ADMIN=false;ME_EMAIL='o@f.test';ME_NAME='Owner Rep';currentProject.userCompany='Fidevia';currentProject.userRole='owner';");
ok(P.run("wfStepIsMine(wfEffectiveSteps('sub',allData.sub[0])[2])")===true, 'Fidevia sees it as theirs');
{
  const txt=P.run("wfProgressHTML('sub',allData.sub[0],0)").replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  ok(/handed over by Test Architect/.test(txt), 'the chain shows the handover on its own line');
  ok(/reassigned from Architect 2/.test(txt), 'and the live step says where it came from');
}
ok(act('o@f.test','Owner Rep','Fidevia','owner','Approved')==='', 'and they can approve it');
ok(P.run("(wfSignedMap(allData.sub[0])['2']||{}).by")==='Owner Rep',
   'the approval lands on that step, recorded to whoever gave it');
ok(cur()===3, 'and the chain moves on to the engineer');

console.log('Handing over a step the project itself defined still works');
seed();
ok(act('a@x.test','Test Architect','Architect 2','architect','__reassign','Fidevia')==='',
   'the architect hands over their own first step');
ok(firm(0)==='Fidevia', 'which becomes Fidevia’s');
ok(/"0":/.test(P.run("allData.sub[0]['Workflow Reassigned']")),
   'recorded by base position, because that is the store that owns it');
ok(steps()[0].reassignedFrom==='Architect 2', 'and it still names who it came from');

console.log('A project step sitting after added ones is keyed by its own position');
// Handing over the FIRST step hid this: base position and chain position were
// both 0, so keying by either worked. A base step that added steps have pushed
// down is where the two come apart.
seed();
act('a@x.test','Test Architect','Architect 2','architect','Revise and Resubmit');
act('gc@s.test','Test Contractor','Summit Builders','contractor','Resubmitted');
act('a@x.test','Test Architect','Architect 2','architect','Approved');
ok(cur()===3 && firm(3)==='Next Level Engineers',
   'the chain reaches the engineer \u2014 third in the chain, second in the project');
ok(act('p@y.test','Penelope Odiem','Next Level Engineers','engineer','__reassign','Fidevia')==='',
   'the engineer hands their step over');
ok(firm(3)==='Fidevia', 'and it goes to Fidevia');
ok(/"1":/.test(P.run("allData.sub[0]['Workflow Reassigned']")),
   'recorded against base position 1 \u2014 keying it 3 would name a step the project never had');
ok(firm(0)==='Architect 2', 'and the architect\u2019s own step is untouched');

console.log('The project’s own workflow is never rewritten');
ok(P.run("JSON.stringify(currentProject.config.workflows.sub)")
   ==='[{"name":"Architect Review","company":"Architect 2"},{"name":"Engineer Review","company":"Next Level Engineers"}]',
   'one submittal is not a reason to change the job');

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
