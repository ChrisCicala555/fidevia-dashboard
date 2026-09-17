// "This step should be company based rather than individual based - also the
// reassignment should be down in the workflow process."
//
// Two faults in one control. The Who picker listed people, so a step handed
// over landed on one desk while the colleagues who can see and answer it had
// no idea — the last individual-based assignment left in the workflow. And
// the handover was applied by swapping the name on the existing step, so the
// chain read as though the project had always named the new firm: the
// architect the job actually appoints vanished from their own submittal, with
// nothing saying a handover had happened.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage('index.html'); P.run(SEED);

const seed=()=>P.run(`
  allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test','Notify - Submittal':'Yes'},
    {'Name':'Second Desk','Company':'Architect 2','Email':'d2@x.test','Notify - Submittal':'Yes'},
    {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test','Notify - Submittal':'Yes'},
    {'Name':'Blake Strickler','Company':'Next Level Engineers','Email':'b@y.test','Notify - Submittal':'Yes'},
    {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'}];
  currentProject.config.workflows.sub=[{name:'Architect Review', company:'Architect 2'}];
  allData.sub=[{'Submittal #':'SUB-GC-010','Description':'HVAC','Company':'Summit Builders',
    'Status':'Pending Review','Workflow Step':'0','Workflow Status':'In Review',
    'Version History':'[]','Workflow Signed':'','Workflow Extra':'','Workflow Done':'',
    'Workflow Reassigned':''}];
  EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='a@x.test'; ME_NAME='Test Architect';
  currentProject.userCompany='Architect 2'; currentProject.userRole='architect'; 1;`);

const handTo=(firm)=>P.run(`openReply('sub',0,true);
  document.getElementById('reply-status').value='__reassign'; replyStatusChanged();
  document.getElementById('reply-next').value=${JSON.stringify(firm)};
  String(applyReviewAdvance('sub', allData.sub[0], 'Test Architect'));`);
const step0=()=>JSON.parse(P.run("JSON.stringify(wfEffectiveSteps('sub',allData.sub[0])[0])"));
const panel=()=>P.run("wfProgressHTML('sub',allData.sub[0],0)");

console.log('The picker offers firms, not people');
seed();
P.run("openReply('sub',0,true); document.getElementById('reply-status').value='__reassign'; replyStatusChanged();");
const opts=P.run("document.getElementById('reply-next').innerHTML");
ok(/value="Architect 2"/.test(opts) && /value="Next Level Engineers"/.test(opts),
   'firms on the project are offered');
ok(!/value="Test Architect"/.test(opts) && !/value="Penelope Odiem"/.test(opts), 'individuals are not');
ok(/2 people/.test(opts), 'with how many people would hear about it');
ok(/Choose a firm on the project/.test(opts),
   'and the empty option asks for a firm');
ok(/everyone there is notified/.test(P.run("document.getElementById('reply-next-hint').textContent")),
   'the hint says the whole firm is told');

console.log('Handing it over moves it to the firm');
seed();
ok(handTo('Next Level Engineers')==='', 'a handover adds nobody to the chain');
const s0=step0();
ok(P.run("wfStepCompany(wfEffectiveSteps('sub',allData.sub[0])[0])")==='Next Level Engineers',
   'the step is now the engineers’');
ok(!s0.person, 'and is not pinned to one person there');
ok(P.run("JSON.stringify(wfSignedMap(allData.sub[0]))")==='{}', 'no approval was recorded — none was given');
ok(P.run("allData.sub[0]['Workflow Step']")==='0', 'and the chain has not moved past it');

console.log('Anyone at that firm can answer it');
P.run("ME_EMAIL='b@y.test'; ME_NAME='Blake Strickler'; currentProject.userCompany='Next Level Engineers';");
ok(P.run("wfStepIsMine(wfEffectiveSteps('sub',allData.sub[0])[0])")===true,
   'a colleague who was never named still sees it as theirs');

console.log('And the chain says it was handed over');
ok(s0.reassignedFrom==='Architect 2', 'the firm it came from is kept on the step');
ok(s0.reassigned===true, 'and it is marked as a handover');
{
  const txt=panel().replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  ok(/Architect 2/.test(txt), 'the architect who was originally asked is still in the chain');
  ok(/handed over/.test(txt), 'on a line of its own saying so');
  ok(/reassigned from Architect 2/.test(txt), 'and the live step says where it came from');
  ok(txt.indexOf('Architect 2') < txt.indexOf('Next Level Engineers'),
     'with the handover above the firm that now holds it');
}

console.log('A step nobody handed over is drawn once');
seed();
{
  const txt=panel().replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  ok(!/handed over/.test(txt), 'no handover line');
  ok((txt.match(/Architect Review/g)||[]).length===1, 'and the step appears once');
}

console.log('Sending it on as well also goes to a firm');
seed();
const added=P.run(`openReply('sub',0,true);
  document.getElementById('reply-status').value='__also'; replyStatusChanged();
  document.getElementById('reply-next').value='Next Level Engineers';
  String(applyReviewAdvance('sub', allData.sub[0], 'Test Architect'));`);
ok(added==='Next Level Engineers', 'the firm is what comes back');
{
  const last=P.run("(()=>{const st=wfEffectiveSteps('sub',allData.sub[0]);return wfStepCompany(st[st.length-1]);})()");
  ok(last==='Next Level Engineers', 'and the added step is theirs');
  ok(!P.run("(()=>{const st=wfEffectiveSteps('sub',allData.sub[0]);return st[st.length-1].person;})()"),
     'with nobody there singled out');
}
ok(/@/.test(P.run("REPLY_CTX && REPLY_CTX._addedEmail || ''")), 'somebody at the firm is emailed');

console.log('The project’s own workflow is untouched by either');
ok(P.run("JSON.stringify(currentProject.config.workflows.sub)")==='[{"name":"Architect Review","company":"Architect 2"}]',
   'one submittal is not a reason to rewrite the job');

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
