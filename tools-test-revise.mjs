// A reviewer can say what they decided, and sending something back is visible
// in the chain rather than silent.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const as = (role,email) => b.run(`EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='${email}'; currentProject.userRole='${role}';`);
const statusShown = () => { b.run("openReply('sub',0,true)");
  return b.run("document.getElementById('reply-status-field').style.display")!=='none'; };

// ── who gets to say what they decided ──
as('architect','a@x.test');   ok(statusShown(), 'an architect is asked for a status');
as('engineer','p@y.test');    ok(statusShown(), 'so is an engineer');
as('contractor','d@s.test');  ok(!statusShown(), 'a contractor resubmitting is not — they are not deciding');
b.run("EXTERNAL=false; IS_ADMIN=true; ME_EMAIL='cc@fidevia.com'; currentProject.userRole='';");
ok(statusShown(), 'and Fidevia keeps it');
ok(/'Under Review','Approved as Noted','Revise and Resubmit','Approved','Rejected'/.test(html),
   'the choices are the ones a submittal review actually has');
{
  const c = html.split('const _sf=document.getElementById')[1].split('const note=')[0];
  // Three cases now, not two. Whoever was shown the field chooses; the side
  // that filed the item is resubmitting; anybody else is adding a version or a
  // note and must not stamp a status over the last real decision.
  ok(/_canDecide \? document\.getElementById\('reply-status'\)\.value/.test(c),
     'whoever was shown the field chooses');
  ok(/replyIsSubmitterSide\(key,_row0\)[^?]*\? 'Resubmitted'/.test(c),
     'the side that filed it is resubmitting');
  ok(/&& !_closed\) \? 'Resubmitted'/.test(c),
     'unless the item is already closed, where a version restates nothing');
  ok(/: String\(_row0\['Status'\]\|\|''\)/.test(c),
     'and anybody else leaves the status exactly where it was');
}

// ── sending it back ──
as('architect','a@x.test');
const review = (status) => {
  b.run(`(()=>{
    allData.sub[0]['Workflow Step']='0'; allData.sub[0]['Workflow Status']='In Review';
    allData.sub[0]['Workflow Signed']=''; allData.sub[0]['Workflow Extra']='';
    allData.sub[0]['Submitted By (Sub)']='Dave Chen (Summit Builders)';
    openReply('sub',0,true);
    document.getElementById('reply-action').value='continue';
    document.getElementById('reply-status').value=${JSON.stringify(status)};
  })()`);
  b.run("applyReviewAdvance('sub', allData.sub[0], 'Test Architect')");
  return {
    chain: b.run("wfEffectiveSteps('sub', allData.sub[0]).map(s=>s.name+'/'+(s.person||'')).join(' -> ')"),
    waiting: b.run("(()=>{const st=wfEffectiveSteps('sub',allData.sub[0]);const i=+allData.sub[0]['Workflow Step'];return st[i]?st[i].person:'(end)';})()"),
    wfStatus: b.run("allData.sub[0]['Workflow Status']"),
    sig: JSON.parse(b.run("JSON.stringify(wfSignedMap(allData.sub[0]))")),
    panel: b.run("wfProgressHTML('sub', allData.sub[0], 0)")
  };
};
{
  const r = review('Revise and Resubmit');
  ok(/Revise and Resubmit\/Dave Chen/.test(r.chain),
     'a step appears for whoever filed it, by name');
  ok(r.waiting==='Dave Chen', 'and the item is waiting on them');
  ok(r.wfStatus==='In Review', 'the chain is open, not complete and not closed');
  ok(r.sig['0'] && r.sig['0'].outcome==='Revise and Resubmit',
     'what the reviewer decided is on the record, not just that they acted');
  ok(r.panel.includes('↩'), 'their step reads as returned');
  ok(!/✓[^<]*<\/span><span[^>]*>Architect Review/.test(r.panel),
     'rather than as approved, which it was not');
  ok(/sent back/.test(r.panel), 'and the new step says why it is there');
}
{
  const r = review('Approved');
  ok(!/Revise and Resubmit/.test(r.chain), 'approving adds nothing');
  ok(r.wfStatus==='Complete', 'and finishes the chain');
  ok(r.sig['0'] && !r.sig['0'].outcome,
     'a plain approval records no outcome, because approved is what a tick already means');
}
ok(/const WF_RETURNED=\/revise\|resubmit\|returned\/i/.test(html),
   'the several ways of saying "send it back" are recognised as one thing');
ok(/function rowSubmitterName\(r\)/.test(html), 'the submitter is worked out from the row');
ok(/replace\(\/\\s\*\\\(\[\^\)\]\*\\\)\\s\*\$\/,''\)/.test(html),
   'with the trailing company dropped, so the step names a person not "Dave (Summit Builders)"');
ok(/auditLog\('Returned for revision'/.test(html), 'and it is audited');

console.log((bad?'FAIL':'ok  '),' tools-test-revise.mjs —',n,'assertions');
process.exit(bad?1:0);
