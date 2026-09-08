// One action for a review: say something, attach something, sign your step, and
// optionally send it on — in a single press, and working for the people who
// actually do the reviewing.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const as = (who,name,ext,admin) => b.run(`EXTERNAL=${ext}; IS_ADMIN=${admin}; ME_EMAIL='${who}'; ME_NAME='${name}';`);
const btns = h => (String(h).match(/<button[^>]*>([\s\S]*?)<\/button>/g)||[])
  .map(x=>x.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&rarr;/g,'->').trim());

// ── an external reviewer can actually write ──
// Reply went through uploadText, which is admin only, so every external reply
// failed after the attachment had already been uploaded to Box.
ok(/if \(op === 'updateRow'\)/.test(srv), 'there is a way to change one row');
{
  const c = srv.split("if (op === 'updateRow')")[1].split("if (op === 'appendRow')")[0];
  ok(/folderWritableBy/.test(c), 'it checks the caller may write here');
  ok(/if \(!seesAllCompanies\(role\)\)/.test(c),
     'a contractor may only touch their own company’s record');
  ok(/const ALLOWED = new Set/.test(c), 'and only the fields a review writes');
  ok(/'Version History'/.test(c) && /'Attachment File ID'/.test(c) && /'Workflow Signed'/.test(c),
     'which covers the reply, the attachment and the signature');
  ok(!/'Approved Amount'/.test(c) && !/'Cost Impact'/.test(c),
     'and not the money');
  ok(/PRIVATE_CSV\[filename\] && \('Status' in patch\)/.test(c),
     'a pay application’s status stays Fidevia’s to set');
  ok(/Field not writable/.test(c), 'anything else is refused by name');
}
ok(/if \(!who\.isAdmin\) return json\(\{ error: 'Access denied' \}, 403\);/.test(
     srv.split("if (op === 'uploadText')")[1].split("if (op === 'updateRow')")[0]),
   'replacing a whole log is still Fidevia’s alone');
ok(/async function boxUpdateRow/.test(html), 'the browser has a matching call');
{
  const c = html.split('async function submitReply()')[1].split('function applyReviewAdvance')[0]
        || html.split('async function submitReply()')[1].slice(0,4000);
  ok(/if\(EXTERNAL\)\{\s*\n\s*await boxUpdateRow/.test(c),
     'and a reply from outside Fidevia goes through it rather than 403ing');
  ok(/await boxUploadText\(mod\.log/.test(c), 'while Fidevia still rewrites the log');
}

// ── one button, not two ──
as('a@x.test','Test Architect',true,false);
let t = btns(b.run("verThreadRows('sub', allData.sub[0], 0, 10)"));
ok(t.length===1, 'the reviewer being waited on sees exactly one button');
ok(/Review & Continue/.test(t[0]), 'and it is the review');
ok(!/Approve Step/.test(b.run("wfProgressHTML('sub', allData.sub[0], 0)")),
   'the workflow panel does not offer a bare approve alongside it');
as('d@s.test','Dave Chen',true,false);
t = btns(b.run("verThreadRows('sub', allData.sub[0], 0, 10)"));
ok(/Submit Updated Version/.test(t.join()), 'someone who is not the reviewer still replies');
ok(!/Review & Continue/.test(t.join()), 'but is not offered the review');
as('cc@fidevia.com','Chris',false,true);
t = btns(b.run("verThreadRows('sub', allData.sub[0], 0, 10)")).join();
ok(/Reply \/ New Version/.test(t), 'Fidevia off the chain keeps the plain reply');
ok(/Override/.test(t), 'and the override, which is what acting for someone else is');

// ── sending it on ──
b.run(SEED); as('a@x.test','Test Architect',true,false);
b.run("openReply('sub',0,true)");
ok(b.run("document.getElementById('reply-next-field').style.display")!=='none',
   'reviewing offers somewhere to send it on');
ok(b.run("(document.getElementById('reply-next').innerHTML.match(/<option/g)||[]).length")>=3,
   'listing the people on the project');
b.run("openReply('sub',0,false)");
ok(b.run("document.getElementById('reply-next-field').style.display")==='none',
   'a plain reply does not, since only a reviewer can extend the chain');

b.run("openReply('sub',0,true)");
b.run("(()=>{const ns=document.getElementById('reply-next'); ns.value='Dave Chen'; ns.options=[{value:'Dave Chen',getAttribute:()=>'d@s.test'}];})()");
const added = b.run("applyReviewAdvance('sub', allData.sub[0], 'Test Architect')");
ok(added==='Dave Chen', 'the chosen person is added');
ok(/Further Review\/Dave Chen/.test(b.run("wfEffectiveSteps('sub', allData.sub[0]).map(s=>s.name+'/'+(s.person||'')).join(' -> ')")),
   'and appears in this item’s chain');
ok(b.run("(()=>{const st=wfEffectiveSteps('sub',allData.sub[0]);const n=+allData.sub[0]['Workflow Step'];return st[n]&&st[n].person;})()")==='Dave Chen',
   'the item is now waiting on them');
ok(b.run("JSON.stringify(currentProject.config.workflows.sub.map(s=>s.name))")==='["Architect Review","Engineer Review"]',
   'the project’s own workflow is untouched — this was one item, not the job');
ok(b.run("JSON.stringify(Object.keys(wfSignedMap(allData.sub[0])))")==='["0"]',
   'the reviewer signed their step and nobody else’s');
ok(b.run("REPLY_CTX && REPLY_CTX._addedEmail")==='d@s.test',
   'and the person it was sent to is emailed rather than left to notice');
// A second item must not inherit it.
b.run("allData.sub.push(Object.assign({},allData.sub[0],{'Submittal #':'SUB-GC-002','Workflow Extra':'','Workflow Step':'0','Workflow Signed':''}))");
ok(b.run("wfEffectiveSteps('sub', allData.sub[1]).length")===2,
   'another submittal keeps the configured chain');

// ── the chain used everywhere is the row’s own ──
ok(/const steps=wfEffectiveSteps\(key, r\); if\(!steps\.length\) return '';/.test(html),
   'the workflow panel reads the row’s own chain');
ok(/const _rvSteps=wfEffectiveSteps\(key,r\);/.test(html),
   'and so does the thread deciding which button to show');
ok(/const steps=wfEffectiveSteps\(key, _r0\)/.test(html), 'and so does advancing it');
ok(/const steps=wfEffectiveSteps\(key, row\)/.test(html), 'and reopening it');
ok((html.match(/'Workflow Extra'/g)||[]).length>=5, 'the added steps are stored on the row');

console.log((bad?'FAIL':'ok  '),' tools-test-review.mjs —',n,'assertions');
process.exit(bad?1:0);
