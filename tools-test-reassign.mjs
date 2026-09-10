// A reviewer can hand their step to somebody else, and handing it over is not
// an approval.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
b.run("EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='a@x.test'; ME_NAME='Test Architect'; currentProject.userRole='architect';");
const run = (action, who) => {
  b.run(`(()=>{
    allData.sub[0]['Workflow Step']='0'; allData.sub[0]['Workflow Status']='In Review';
    allData.sub[0]['Workflow Signed']=''; allData.sub[0]['Workflow Extra']=''; allData.sub[0]['Workflow Reassigned']='';
    openReply('sub',0,true);
    document.getElementById('reply-action').value='${action}';
    const ns=document.getElementById('reply-next');
    ns.value=${JSON.stringify(who||'')};
    ns.options=[{value:${JSON.stringify(who||'')}, getAttribute:()=>'dave@summit.test'}];
  })()`);
  const added = b.run("applyReviewAdvance('sub', allData.sub[0], 'Test Architect')");
  return { added,
    signed: JSON.parse(b.run("JSON.stringify(Object.keys(wfSignedMap(allData.sub[0])))")),
    step: b.run("allData.sub[0]['Workflow Step']"),
    status: b.run("allData.sub[0]['Workflow Status']"),
    chain: b.run("wfEffectiveSteps('sub', allData.sub[0]).map(s=>s.name+'/'+(s.person||'')).join(' -> ')"),
    to: b.run("REPLY_CTX && REPLY_CTX._reassignedTo || ''") };
};

// ── recording a review, as before ──
{
  const r = run('continue','');
  ok(r.signed.join()==='0', 'reviewing signs the reviewer’s own step');
  // The seeded submittal chain is an architect and an engineer in parallel, and
  // a group of two now needs both. One review signs its own step and leaves the
  // item with the other reviewer rather than finishing it.
  ok(r.status==='In Review', 'and the chain waits for the other reviewer in the group');
  ok(!/Further Review/.test(r.chain), 'with nobody added');
}
// ── review, and send it on as well ──
{
  const r = run('also','Dave Chen');
  ok(r.signed.join()==='0', 'the review is still recorded');
  ok(r.added==='Dave Chen' && /Further Review\/Dave Chen/.test(r.chain), 'and they are added after');
  ok(r.status==='In Review', 'so the item is still open');
}
// ── hand it over, which is not an approval ──
{
  const r = run('reassign','Dave Chen');
  ok(r.signed.length===0,
     'handing the step over records no approval — nobody gave one');
  ok(/Architect Review\/Dave Chen/.test(r.chain), 'the step now belongs to them');
  ok(r.step==='0' && r.status==='In Review', 'and the item has not moved on, it is waiting for them');
  ok(!/Further Review/.test(r.chain), 'no extra step is invented; this is a handover, not an addition');
  ok(r.to==='Dave Chen', 'and the reply says who it went to');
}
ok(b.run("JSON.stringify(currentProject.config.workflows.sub.map(s=>s.person))")==='["Test Architect","Penelope Odiem"]',
   'through all of it the project’s own workflow is untouched — one submittal is not a reason to rewrite the job');

// ── the dialog only asks for a name when it needs one ──
b.run("document.getElementById('reply-action').value='continue'; replyActionChanged();");
ok(b.run("document.getElementById('reply-next-who').style.display")==='none',
   'recording a plain review asks for nobody');
b.run("document.getElementById('reply-action').value='reassign'; replyActionChanged();");
ok(b.run("document.getElementById('reply-next-who').style.display")!=='none', 'handing over asks who');
ok(/Your approval is not recorded/.test(b.run("document.getElementById('reply-next-hint').textContent")),
   'and says plainly that no approval is being given');
b.run("document.getElementById('reply-action').value='also'; replyActionChanged();");
ok(/added after you/.test(b.run("document.getElementById('reply-next-hint').textContent")),
   'while sending it on says the opposite');

// ── stored on the row, like the added steps ──
ok(/'Workflow Reassigned'/.test(html), 'the handover is stored on the item');
ok((html.match(/'Workflow Reassigned'/g)||[]).length>=5, 'on every module that has a workflow');
{
  const c = html.split('function wfEffectiveSteps(key, row)')[1].split('// Company that submitted a row')[0];
  ok(/moved\[String\(i\)\]/.test(c), 'and applied when the chain is read');
  ok(/reassigned:true/.test(c), 'marked as reassigned, so the panel could say so');
}
ok(/auditLog\('Review step reassigned'/.test(html), 'and it is audited');

console.log((bad?'FAIL':'ok  '),' tools-test-reassign.mjs —',n,'assertions');
process.exit(bad?1:0);
