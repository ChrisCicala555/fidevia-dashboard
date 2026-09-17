// "Should be a warning if the contractor tries to submit a final payment
// application before pencil copy workflow steps are completed."
//
// The formal application is built on what the pencil copy brings back. Filed
// while it is still being marked up, it is built on nothing — and whatever the
// architect asks for afterwards lands on a document the owner has already been
// shown. Said, not refused: a due date does not move because a review is slow,
// and it is the contractor who is on the hook for the date.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`EXTERNAL=true; IS_ADMIN=false;
  viewingAsExternal=function(){ return true; };
  viewingAsCompany=function(){ return 'Summit Builders'; };`);

const FID={step:'Fidevia Signature', person:'Christopher Cicala', company:'Fidevia'};
const ARCH={step:'Architect Signature', person:'Test Architect', company:'Architect 2'};
const chain=(steps)=>P.run(`wfEffectiveSteps=function(){ return ${JSON.stringify(steps)}; };`);
const R=(o)=>Object.assign({'App #':'PA-002','Contractor':'Summit Builders','Company':'Summit Builders',
  'Copy Type':'Pencil','Status':'Pencil — with Fidevia','Period':'2026-09-01',
  'Workflow Status':'In Review','Workflow Step':'0','Workflow Done':'','Workflow Signed':'',
  'Attachment File ID':'a','Attachment Name':'pencil.pdf'}, o);
const warn=(row)=>P.run(`payPencilOpenWarning(${JSON.stringify(row)})`);

console.log('A pencil still out for review');
{
  chain([FID,ARCH]);
  const w=warn(R());
  ok(!!w, 'filing the final on top of it is worth saying something about');
  ok(/has not come back yet/.test(w), 'the point being that nothing has come back to build on');
  ok(/still with Fidevia/.test(w), 'and it names who is holding it, which is the actionable part — '+w);
  ok(/the owner has already seen/.test(w),
     'and says what goes wrong: a correction landing on a document that has left the building');
}
{
  // Fidevia signed, the architect has not. Halfway is not finished.
  chain([FID,ARCH]);
  const w=warn(R({'Status':'Pencil — with Architect 2','Workflow Step':'1',
    'Workflow Signed':JSON.stringify({'0':{by:'Christopher Cicala',at:'2026-09-16'}})}));
  ok(!!w && /still with Architect 2/.test(w),
     'the warning follows the chain to whoever actually has it now — '+w);
}
{
  // A row whose chain never started names nobody rather than guessing.
  chain([FID,ARCH]);
  const w=warn(R({'Workflow Status':''}));
  ok(!!w, 'a pencil with no review running has still not come back');
  ok(!/still with/.test(w), 'and no name is invented for it — '+w);
  ok(/not come back yet\. The formal application/.test(w), 'the sentence still reads — '+w);
}

console.log('A pencil that has come back');
{
  chain([FID,ARCH]);
  ok(warn(R({'Status':'Pencil approved — awaiting final'}))===null,
     'approved is the whole point of the pencil copy, and needs no warning');
  ok(warn(R({'Status':'Pencil approved as noted — awaiting final'}))===null,
     'approved as noted too — the notes are what the final is built on');
}
{
  // Not this warning's job: a sent-back or refused pencil has no Submit Final
  // button at all, which payMayPromote settles.
  ok(P.run(`payMayPromote(${JSON.stringify(R({'Status':'Revise and resubmit — awaiting contractor'}))})`)===false,
     'a pencil sent back is not offered for promotion in the first place');
  ok(P.run(`payMayPromote(${JSON.stringify(R({'Status':'Pencil rejected'}))})`)===false, 'nor a refused one');
  ok(P.run(`payMayPromote(${JSON.stringify(R())})`)===true,
     'while one still under review is — which is exactly the case the warning covers');
}
{
  ok(warn({'Copy Type':'Final','Status':'Uploaded'})===null, 'a final is not a pencil and has no such warning');
  ok(warn(null)===null, 'and nothing throws on no row at all');
}

console.log('Where the contractor meets it');
{
  // Opened for real, and read off the dialog rather than off the source: a
  // warning worked out and then written nowhere is the failure worth catching.
  const open=(row)=>{ P.run(`allData.pay_apps=[${JSON.stringify(row)}]; openPayFinal(0);`);
    return { shown:P.run(`document.getElementById('payfinal-warn').innerHTML`),
             btn:P.run(`document.getElementById('payfinal-btn').textContent`),
             off:P.run(`document.getElementById('payfinal-btn').disabled`),
             title:P.run(`document.getElementById('payfinal-title').textContent`) }; };
  chain([FID,ARCH]);
  const out=open(R());
  ok(/has not come back yet/.test(out.shown), 'the warning reaches the dialog \u2014 '+out.shown);
  ok(/still with Fidevia/.test(out.shown), 'naming who is holding it');
  ok(/color:#8a5a00;font-weight:600/.test(out.shown),
     'in the same amber as every other warning in the app, not as a passing hint');
  ok(out.btn==='Submit Final anyway',
     'and the button says "anyway", so the click is a decision rather than a reflex \u2014 '+out.btn);
  ok(out.off===false, 'but it is not disabled \u2014 the due date is still theirs to meet');
  ok(/PA-002/.test(out.title), 'and it is the right application \u2014 '+out.title);

  const clean=open(R({'Status':'Pencil approved \u2014 awaiting final'}));
  ok(clean.shown==='', 'a pencil that has come back leaves the dialog unmarked');
  ok(clean.btn==='Submit Final', 'and the button plain');
  // Reopened on the bad row, to be sure the clean pass did not just leave a
  // stale empty div behind.
  ok(/has not come back yet/.test(open(R()).shown), 'and the two states do not stick to each other');

  ok(/<div id="payfinal-warn"><\/div>/.test(html) &&
     html.indexOf('<div id="payfinal-warn">') < html.indexOf('id="payfinal-file"'),
     'the warning sits above the file control, where it is read before the file is chosen');
}

console.log(bad ? `FAIL tools-test-finalearly.mjs — ${bad} of ${n}` : `ok   tools-test-finalearly.mjs — ${n} assertions`);
process.exit(bad?1:0);
