// A tick means somebody approved. It used to mean the workflow had moved past
// that row, which is not the same claim.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const pre = `
function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function etToday(){ return '2026-09-08'; }
let ME_EMAIL='cc@fidevia.com', IS_ADMIN=true, STEPS=[];
function wfStepsFor(){ return STEPS; }
function rowCompany(){ return ''; }
function wfIsStopped(r){ return /reject|denied/i.test(String(r['Workflow Status']||'')); }
function wfIsDone(r){ return String(r['Workflow Status']||'')==='Complete'; }
function wfActiveIdx(r){ const n=parseInt(r['Workflow Step']); return isNaN(n)?0:n; }
function wfCompanyOf(p){ return ({'Test Architect':'Architect 2','Penelope Odiem':'Next Level Engineers'})[p]||''; }
function wfEmailOf(p){ return ({'Test Architect':'arch@a2.test','Penelope Odiem':'pen@nle.test'})[p]||''; }
function wfCanAdvance(){ return true; }
function withBusy(){}
// The panel reads the chain as it applies to one row, and marks the reader's
// own step. Neither existed when this test was written; the steps are set
// explicitly here, so the effective chain is the set chain.
function wfEffectiveSteps(){ return STEPS; }
const WF_RETURNED=/revise|resubmit|returned/i;
function wfIsReturnOutcome(x){ const t=String(x||'').trim();
  return WF_RETURNED.test(t) && !/^re-?submitted$/i.test(t); }
`;
const sig  = html.slice(html.indexOf('// Who actually approved which step.'), html.indexOf('function wfEmailOf(person)'));
const mine = html.slice(html.indexOf('function wfStepIsMine(st)'), html.indexOf('function wfProgressHTML'));
const progStart = html.indexOf('function wfProgressHTML');
const prog = html.slice(progStart, html.indexOf('\n}\n', html.indexOf("+items+'<div style=\"margin-top:6px;font-size:13px;\">'"))+3);
const H = new Function(pre + sig + mine + prog +
  '\nreturn {wfProgressHTML,wfSignedMap,wfMarkSigned,wfHasSignatureRecord,wfMyStepsIn,' +
  'setSteps:s=>{STEPS=s;}, setMe:(e,a)=>{ME_EMAIL=e;IS_ADMIN=a;}};')();
const strip = x => x.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

H.setSteps([
  {name:'Architect Review', person:'Test Architect', email:'arch@a2.test'},
  {name:'Engineer Review',  person:'Penelope Odiem', email:'pen@nle.test', parallel:true}
]);

// ── the bug in the screenshot ──
let row={'Workflow Step':'0','Workflow Status':'In Review'};
H.wfMarkSigned(row,0,'Test Architect',false);
row['Workflow Status']='Complete'; row['Workflow Step']='1';
let out=strip(H.wfProgressHTML('sub',row,0));
ok((out.match(/✓/g)||[]).length===1,
   'one approval draws one tick, not a tick against everyone in the parallel group');
ok(/not required — the group moved on/.test(out),
   'the reviewer who never acted is shown as not required, not as approved');
ok(/approved 2026-09-08 · Test Architect/.test(out), 'the approval that happened is attributed');

// ── an override is visible as one ──
let row2={'Workflow Step':'0','Workflow Status':'In Review'};
H.wfMarkSigned(row2,0,'Test Architect',false);
H.wfMarkSigned(row2,1,'ccicala@fidevia.com (override)',true);
row2['Workflow Status']='Complete';
out=strip(H.wfProgressHTML('sub',row2,0));
ok(/override/.test(out), 'a stand-in approval is labelled an override on the record');
ok(/ccicala@fidevia.com \(override\)/.test(out), 'naming who recorded it');
ok((out.match(/✓/g)||[]).length===2, 'and it does count as approved');

// ── records that predate attribution ──
out=strip(H.wfProgressHTML('sub',{'Workflow Step':'1','Workflow Status':'Complete'},0));
ok((out.match(/✓/g)||[]).length===2, 'an older item keeps the marks it had');
ok(/recorded before each one was attributed/.test(out),
   'but says so, rather than implying it knows who signed');
ok(!H.wfHasSignatureRecord({}), 'an item with no record is recognised as having none');

// ── the button says what pressing it means ──
H.setMe('cc@fidevia.com', true);
out=strip(H.wfProgressHTML('sub',{'Workflow Step':'0','Workflow Status':'In Review'},0));
ok(/Override — Record An Approval/.test(out),
   'Fidevia, not named on the step, is offered an override rather than an approval');
ok(/This step is not yours/.test(out), 'and told why');
H.setMe('arch@a2.test', false);
out=strip(H.wfProgressHTML('sub',{'Workflow Step':'0','Workflow Status':'In Review'},0));
// The reviewer's own step is Review & Continue, above this panel: one action
// that records what they decided as well as that they acted. A bare Approve
// beside it invited an approval with no review attached, so it is not offered.
ok(!/Override/.test(out) && !/Approve Step/.test(out),
   'the assigned reviewer is not offered a second, wordless approval');
ok(/YOUR REVIEW/.test(out), 'their own step is called out instead');
ok(H.wfMyStepsIn([{email:'arch@a2.test'},{email:'pen@nle.test',parallel:true}],0,1).join()==='0',
   'and the step matched is their own');
H.setMe('cc@fidevia.com', true);
ok(H.wfMyStepsIn([{email:'arch@a2.test'},{email:'pen@nle.test',parallel:true}],0,1).length===0,
   'while Fidevia is on neither');

// ── the record itself ──
{
  const r={}; H.wfMarkSigned(r,2,'Someone',false);
  const m=H.wfSignedMap(r);
  ok(m['2'] && m['2'].by==='Someone', 'a signature records who');
  ok(m['2'].at==='2026-09-08', 'and when');
  ok(m['2'].override===false, 'and whether it was a stand-in');
  H.wfMarkSigned(r,3,'Another',true);
  ok(Object.keys(H.wfSignedMap(r)).length===2, 'signatures accumulate rather than replacing');
  ok(H.wfSignedMap({'Workflow Signed':'not json'})+''==='[object Object]',
     'a corrupt record reads as empty rather than throwing');
}

// ── stored, and on every module ──
ok((html.match(/'Workflow Signed'/g)||[]).length>=5,
   'the field is on the modules that have workflows');
['rfi:','co:','sub:','pay_apps:'].forEach(k=>{
  const line=html.split('\n').find(l=>l.trim().startsWith(k) && l.includes('Workflow Step'));
  ok(!!line && line.includes('Workflow Signed'), k.replace(':','')+' stores it');
});

// ── the advance path ──
{
  const c = html.split('const needsAll=steps.slice(gs,ge+1).some(st=>st&&st.requireAll);')[1].split('const next=ge+1;')[0];
  ok(/const mine=wfMyStepsIn\(steps,gs,ge\);/.test(c), 'every group works out whose approval it is');
  ok(!/if\(needsAll\)\{[\s\S]*const mine=/.test(c),
     'not only the groups that require everybody, which was the gap');
  ok(/if\(!IS_ADMIN\) return;/.test(c), 'someone not on the step and not Fidevia cannot advance it');
  ok(/override=true;/.test(c), 'Fidevia standing in is marked an override');
  ok(/auditLog\('Workflow override'/.test(c), 'and audited');
  ok(/wfMarkSigned\(row, n,/.test(c), 'the signature is written for every path');
  ok(/It will be logged as an override by you/.test(c), 'the confirmation says so before it happens');
}
// ── and on the server, which is the copy that is enforced ──
{
  const c = srv.split('const groupNeedsAll =')[1].split('const groupSatisfied =')[0];
  ok(/const mine = \[\];/.test(c) && !/if \(groupNeedsAll\) \{\s*\/\/ Record only/.test(c),
     'the server works out whose approval it is for every group');
  ok(/if \(!who\.isAdmin\) return json\(\{ error: 'This step is not assigned to you\.' \}, 403\)/.test(c),
     'and refuses someone not on the step');
  ok(/isOverride = true/.test(c), 'an admin standing in is marked an override');
  ok(/toSign\.forEach\(n => markSigned\(/.test(c), 'the signature is recorded');
}
ok(/if \(!headers\.includes\('Workflow Signed'\)\) headers\.push/.test(srv),
   'the column is added to logs that predate it');

console.log((bad?'FAIL':'ok  '),' tools-test-wfsign.mjs —',n,'assertions');
process.exit(bad?1:0);
