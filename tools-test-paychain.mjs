// "I reviewed the pencil copy, however I do not see the notifications extend to
// the architect or the contractor... the email also notified everyone saying
// pencil was approved when really it needs another step of review."
//
// The steps were configured, the columns were written at filing, and nothing
// ever moved them. Fidevia recorded a review and the row went straight to
// approved: the architect was never asked, nobody's Needs Your Attention
// changed, and the email announced a decision one of two reviewers had made.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`
  ME_NAME='Christopher Cicala'; ME_EMAIL='chris@fidevia.com';
  allData.contacts=[{'Name':'Christopher Cicala','Email':'chris@fidevia.com','Company':'Fidevia'},
                    {'Name':'Test Architect','Email':'arch@example.com','Company':'Architect 2'}];
  currentProject={name:'X',folders:{pay_apps:'9'},config:{workflows:{}}};
  wfSteps=function(){ return [
    {name:'Fidevia Review', person:'Christopher Cicala', company:'Fidevia', email:'chris@fidevia.com'},
    {name:'Architect Review', person:'Test Architect', company:'Architect 2', email:'arch@example.com'}
  ]; };
  wfEffectiveSteps=function(){ return wfSteps(); };
`);
const ROW=(o)=>Object.assign({'App #':'PA #01','Contractor':'Summit Builders','Company':'Summit Builders',
  'Copy Type':'Pencil','Status':'Pencil — awaiting Fidevia','Workflow Step':'0',
  'Workflow Status':'In Review','Workflow Done':'','Workflow Signed':''}, o);
const advance=(row,by,outcome)=>P.run(`(function(){ var r=${JSON.stringify(row)};
  var res=payAdvanceChain(r, ${JSON.stringify(by)}, ${JSON.stringify(outcome)});
  return {res:res, row:r}; })()`);

console.log('One review is one step, not the whole chain');
{
  const a=advance(ROW(),'Christopher Cicala','Approved');
  ok(a.res.complete===false, "Fidevia's review does not finish a two-step chain");
  ok(a.row['Workflow Step']==='1', 'the chain moves to the architect');
  ok(a.row['Workflow Status']==='In Review', 'and is still running');
  ok(a.res.names.join()==='Test Architect', 'which is who it is with now');
  ok(a.res.emails.join()==='arch@example.com', 'and where to write to');
  ok(a.res.step==='Fidevia Review', 'while naming the step that was just recorded');
  const signed=JSON.parse(a.row['Workflow Signed']||'{}');
  ok(signed['0'] && signed['0'].by==='Christopher Cicala', 'the step carries who answered it');
  ok(!signed['0'].override, 'and is not marked an override, because it was theirs to answer');
  ok(!signed['1'], "and the architect's step is not ticked on their behalf");
}
{
  const b=advance(ROW({'Workflow Step':'1'}),'Test Architect','Approved');
  ok(b.res.complete===true, 'the last step finishes it');
  ok(b.row['Workflow Status']==='Complete', 'and the chain says so');
  ok(b.res.names.length===0, 'with nobody left to tell');
}
{
  // Fidevia answering somebody else's step is the documented override.
  const c=advance(ROW({'Workflow Step':'1'}),'Christopher Cicala','Approved');
  const signed=JSON.parse(c.row['Workflow Signed']||'{}');
  ok(signed['1'] && signed['1'].override===true,
     'a step answered by somebody it does not name is recorded as an override, not as their answer');
  ok(signed['1'].forName==='Test Architect', 'and says whose step it was');
}
{
  P.run(`wfSteps=function(){ return []; };`);
  ok(advance(ROW(),'Christopher Cicala','Approved').res===null,
     'a project with no steps configured has no chain to move');
  P.run(`wfSteps=function(){ return [
    {name:'Fidevia Review', person:'Christopher Cicala', company:'Fidevia', email:'chris@fidevia.com'},
    {name:'Architect Review', person:'Test Architect', company:'Architect 2', email:'arch@example.com'}]; };`);
}

console.log('A parallel group waits for everyone in it');
{
  P.run(`wfSteps=function(){ return [
    {name:'Fidevia Review', person:'Christopher Cicala', company:'Fidevia', email:'chris@fidevia.com'},
    {name:'Engineer Review', person:'Test Engineer', company:'Engineer 1', email:'eng@example.com', parallel:true},
    {name:'Architect Review', person:'Test Architect', company:'Architect 2', email:'arch@example.com'}
  ]; };`);
  const a=advance(ROW(),'Christopher Cicala','Approved');
  ok(a.res.complete===false && a.res.waiting && a.res.waiting.join()==='Test Engineer',
     'answering one half of a parallel group leaves it waiting on the other');
  ok(a.row['Workflow Step']==='0', 'and the chain does not move past a group nobody has finished');
  const signed=JSON.parse(a.row['Workflow Signed']||'{}');
  ok(signed['0'] && !signed['1'],
     'only the step that was answered is ticked \u2014 the engineer approved nothing');
  ok(JSON.parse(a.row['Workflow Done']||'[]').join()==='0', 'and the part-done group remembers who has answered');
  // The engineer answering is the engineer, not Fidevia standing in.
  P.run(`ME_NAME='Test Engineer'; ME_EMAIL='eng@example.com';`);
  const b=advance(a.row,'Test Engineer','Approved');
  P.run(`ME_NAME='Christopher Cicala'; ME_EMAIL='chris@fidevia.com';`);
  ok(b.res.complete===false && !b.res.waiting, 'the second answer finishes the group');
  ok(b.row['Workflow Step']==='2' && b.res.names.join()==='Test Architect', 'and the chain moves on');
  ok(b.row['Workflow Done']==='[]', 'with the part-done record cleared for the next group');
  P.run(`wfSteps=function(){ return [
    {name:'Fidevia Review', person:'Christopher Cicala', company:'Fidevia', email:'chris@fidevia.com'},
    {name:'Architect Review', person:'Test Architect', company:'Architect 2', email:'arch@example.com'}]; };`);
}

console.log('What the row says while somebody is still to look at it');
{
  ok(P.run(`payMidChainStatus(${JSON.stringify(ROW())},['Test Architect'])`)
     ==='Pencil \u2014 awaiting Test Architect',
     'not "approved" \u2014 it names who it is waiting on');
  ok(P.run(`payMidChainStatus(${JSON.stringify(ROW({'Copy Type':'Final'}))},['Test Architect'])`)
     ==='Awaiting Test Architect', 'the final copy reads the same way without the word pencil');
  ok(P.run(`payMidChainStatus(${JSON.stringify(ROW())},[])`)==='Pencil \u2014 awaiting the next reviewer',
     'and says something useful even when the step names nobody');
  // Still outstanding, so it keeps counting as outstanding.
  ok(P.run(`payIsOutstanding({'Status':'Pencil \u2014 awaiting Test Architect'})`)===true,
     'a part-reviewed application is still waiting, and the counts still say so');
  ok(P.run(`payApproved({'Copy Type':'Final','Status':'Awaiting Test Architect','Requested Amount':'50000'})`)===0,
     'and bills nothing, because nobody has approved it');
}

console.log('Where it is wired into the review');
{
  const sub=html.split('async function submitPayAction(){')[1].split('\nfunction updateContractBar')[0];
  ok(/let _chain=null;/.test(sub) && /_chain=payAdvanceChain\(row, by, action\);/.test(sub),
     'an ordinary outcome moves the chain');
  ok(/if\(_chain && !_chain\.complete\) status=payMidChainStatus\(row, _chain\.names\);/.test(sub),
     'and the status follows what the chain says, rather than announcing the outcome');
  ok(/const _returning=\/revise\|resubmit\/i\.test\(action\);/.test(sub), 'a return is treated apart');
  ok(/if\(_returning\)\{[\s\S]{0,400}row\['Workflow Status'\]='';/.test(sub),
     'nothing is signed and the chain is set aside, or Needs Your Attention goes on naming the reviewer '
     +'while the document sits with the contractor');
  ok(/\} else if\(_against\)\{[\s\S]{0,200}wfApplyDecision\('pay_apps', row, status, by\)/.test(sub),
     'and a refusal closes the chain the way every other module closes one');
}

console.log('And into the email');
{
  const sub=html.split('async function submitPayAction(){')[1].split('\nfunction updateContractBar')[0];
  ok(/const _pending=!!\(_chain && !_chain\.complete\);/.test(sub), 'the email knows whether it is finished');
  ok(/\(_chain\.step\|\|'Review'\)\+' recorded \\u2014 now with '/.test(sub),
     'mid-chain it says a step was recorded and who has it now');
  ok(/extraTo:_extra\.concat\(\(_chain&&_chain\.emails\)\|\|\[\]\)/.test(sub),
     'and it reaches the next reviewer, who otherwise would never learn it was their turn');
  ok(/\.concat\(_pending\?\[\['Now with',_chain\.names\.join\(', '\)\|\|'\\u2014'\]\]:\[\]\)/.test(sub),
     'naming them in the body as well as the subject');
}

console.log('Needs Your Attention picks it up because the chain is running');
{
  // The panel already handled pay_apps: it asks for steps, a Workflow Status
  // and a group that matches the reader. Nothing ever set the second.
  const att=html.split('function renderAttention(')[1].split('\n}')[0];
  ok(/\['pay_apps',pays,'App #','payapps'\]/.test(att), 'payment applications were already in the panel');
  ok(/if\(!String\(r\['Workflow Status'\]\|\|''\)\.trim\(\)\) return;/.test(att),
     'and it needs a running chain, which is what was missing');
}

console.log('The dialog says where the application is, before anything is recorded');
{
  const note=(row)=>String(P.run(`payChainNoteHTML(${JSON.stringify(row)})`)).replace(/<[^>]+>/g,' ')
    .replace(/\s+/g,' ').trim();
  P.run(`wfSteps=function(){ return [
    {name:'Fidevia Records Amounts', person:'Christopher Cicala', company:'Fidevia', email:'chris@fidevia.com'},
    {name:'Fidevia Review', person:'Christopher Cicala', company:'Fidevia', email:'chris@fidevia.com'},
    {name:'Architect Review', person:'Test Architect', company:'Architect 2', email:'arch@example.com'}]; };`);
  // The chain in front of us has three steps and the first two are Fidevia's.
  // One review does not reach the architect, and nothing on the screen said so.
  const a=note(ROW({'Workflow Step':'0'}));
  ok(/Step 1 of 3/.test(a), 'which step is being recorded, out of how many');
  ok(/Fidevia Records Amounts — Christopher Cicala/.test(a), 'what it is and whose it is');
  ok(/Then: Fidevia Review — Christopher Cicala → Architect Review — Test Architect/.test(a),
     'and what follows — so two Fidevia steps before the architect is visible rather than surprising');
  const b=note(ROW({'Workflow Step':'2'}));
  ok(/Step 3 of 3/.test(b) && /Last step — recording this completes the chain\./.test(b),
     'the last step says it is the last');
  ok(!/Then:/.test(b), 'with nothing listed after it');
}
{
  const note=(row)=>String(P.run(`payChainNoteHTML(${JSON.stringify(row)})`));
  P.run(`wfSteps=function(){ return []; };`);
  const t=note(ROW()).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  ok(/No review chain is set up for pencil copies on this project/.test(t),
     'a project with no chain configured says so, rather than looking like one that silently told nobody');
  ok(/Settings → Workflows/.test(t), 'and says where to set one up');
  ok(/color:#8a5a00/.test(note(ROW())), 'marked, because it is something to go and fix');
  ok(/No review chain is set up for final applications/.test(
       note(ROW({'Copy Type':'Final'})).replace(/<[^>]+>/g,' ')),
     'naming whichever of the two chains is missing');
  P.run(`wfSteps=function(){ return [
    {name:'Fidevia Review', person:'Christopher Cicala', company:'Fidevia', email:'chris@fidevia.com'},
    {name:'Architect Review', person:'Test Architect', company:'Architect 2', email:'arch@example.com'}]; };`);
}
{
  const note=(row)=>String(P.run(`payChainNoteHTML(${JSON.stringify(row)})`)).replace(/<[^>]+>/g,' ')
    .replace(/\s+/g,' ').trim();
  ok(/This step is not yours\./.test(note(ROW({'Workflow Step':'1'}))),
     'a step belonging to somebody else says so before it is answered');
  ok(/entered as an override, in your name, against Test Architect/.test(note(ROW({'Workflow Step':'1'}))),
     'naming who it will be recorded against');
  ok(!/This step is not yours/.test(note(ROW({'Workflow Step':'0'}))), 'and says nothing when it is yours');
  ok(/This chain was closed by an earlier decision\./.test(note(ROW({'Workflow Status':'Rejected'}))),
     'a closed chain says that instead of a step');
}
ok(/id="pa-chain-note"/.test(html), 'there is somewhere in the dialog for it');
ok(/cn\.innerHTML=payChainNoteHTML\(r\);/.test(html), 'filled when the dialog opens');
ok(/catch\(e\)\{ cn\.innerHTML=''; \}/.test(html),
   'and empty rather than broken if the chain cannot be read');

console.log('And says where it went afterwards');
{
  const sub=html.split('async function submitPayAction(){')[1].split('\nfunction updateContractBar')[0];
  ok(/prog\.textContent='Recorded\. Now with '\+\(_who\|\|'the next reviewer'\)\+'\.';/.test(sub),
     'a review that closes on silence is one nobody can tell worked');
  ok(/_chain\.waiting\|\|_chain\.names/.test(sub),
     'naming the rest of a part-answered group as readily as the next one');
  ok(/prog\.textContent='Recorded\. Every step is done\.';/.test(sub), 'and says when there is nobody left');
  ok(/prog\.textContent='Sent back to the contractor\.';/.test(sub), 'or that it went back');
  ok(/setTimeout\(closePayAction, 1100\);/.test(sub), 'leaving it on screen long enough to read');
}

console.log('A final copy starts its own chain');
{
  const f=html.split('async function submitPayFinal(){')[1].split('\nfunction payCurrentPeriod')[0];
  ok(/r\['Workflow Step'\]='0';/.test(f), 'at the beginning');
  ok(/r\['Workflow Status'\]=wfSteps\('pay_apps', r\)\.length \? 'In Review' : '';/.test(f),
     'running, where there are steps to run');
  ok(/r\['Workflow Done'\]='\[\]'; r\['Workflow Signed'\]='\{\}';/.test(f),
     'and with none of the pencil copy\u2019s signatures carried onto it \u2014 those were a different question');
  ok(/'Workflow Step': r\['Workflow Step'\], 'Workflow Status': r\['Workflow Status'\]/.test(f),
     'all of which is saved');
  ok(/r\['Workflow Step'\]=b\.ws; r\['Workflow Status'\]=b\.wt;/.test(f), 'and put back if the save fails');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-paychain.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
