// "Can we have the email templates for all the kinds of emails you can send?
// ... truthfully make it every kind of email that can be sent. Maybe instead
// of a list, make it a slider that goes through all the things."
//
// There were twenty send sites. Four were editable; the rest were strings
// typed into the middle of a function, so nobody could see what the system
// actually says to people, let alone change it.
import fs from 'fs';
import { execSync } from 'child_process';
execSync('node tools-extract-filters.mjs', { cwd: process.cwd() });
const S = await import('./.filters.tmp.mjs');
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage('index.html'); P.run(SEED);
const ids=JSON.parse(P.run("JSON.stringify(EMAIL_KINDS.map(k=>k.id))"));

console.log('Every email is in the registry, once');
ok(ids.length===19, 'nineteen of them');
ok(new Set(ids).size===ids.length, 'no id twice');
ok(ids.join()===S.EMAIL_IDS.join(),
   'and the browser and the server agree on the list — the editor and the store cannot drift');

console.log('Each one says what it is and what fills it in');
{
  let bare=[];
  ids.forEach((id,i)=>{
    const k=JSON.parse(P.run(`JSON.stringify(EMAIL_KINDS[${i}])`));
    if(!k.label||!k.when||!k.who||!k.subject||!k.intro||!k.fixed||!(k.vars||[]).length) bare.push(id);
  });
  ok(bare.length===0, 'all of them carry a label, a trigger, an audience, wording and fill-ins ('+bare.join(', ')+')');
}
{
  // A fill-in the sample never supplies would render as a literal {brace} in a
  // real email.
  const missing=[];
  ids.forEach((id,i)=>{
    const k=JSON.parse(P.run(`JSON.stringify(EMAIL_KINDS[${i}])`));
    const used=(k.subject+' '+k.intro).match(/\{(\w+)\}/g)||[];
    used.forEach(u=>{ if(!k.vars.includes(u)) missing.push(id+' '+u); });
  });
  ok(missing.length===0, 'and no wording uses a fill-in it does not declare ('+missing.join(', ')+')');
}
{
  const unknown=[];
  ids.forEach((id,i)=>{
    const k=JSON.parse(P.run(`JSON.stringify(EMAIL_KINDS[${i}])`));
    const v=JSON.parse(P.run("JSON.stringify(etSample())"));
    k.vars.forEach(x=>{ if(!(x.slice(1,-1) in v)) unknown.push(id+' '+x); });
  });
  ok(unknown.length===0, 'and the preview can fill in every one ('+unknown.join(', ')+')');
}

console.log('The slider steps through them');
P.run("PS_EMAIL={}; ET_AT=0; etRender();");
ok(P.run("document.getElementById('et-pos').textContent")==='1 of 19', 'it says where you are');
P.run("etStep(1)");
ok(P.run("ET_AT")===1, 'next moves on');
P.run("etStep(-1); etStep(-1)");
ok(P.run("ET_AT")===0, 'and it stops at the first rather than going negative');
P.run("etGo(999)");
ok(P.run("ET_AT")===18, 'and at the last');
P.run("etGo(0)");
ok(/New RFI/.test(P.run("document.getElementById('et-body').innerHTML")), 'the chosen one is what is drawn');

console.log('Editing one, and putting it back');
P.run("etSet('subject','Ref {number} for {project}')");
ok(P.run("etVal('rfi','subject')")==='Ref {number} for {project}', 'the field holds what was typed');
ok(P.run("PS_DIRTY")===true, 'and the page is unsaved');
ok(/Ref RFI-014 for Ithaca Housing Complex/.test(P.run("document.getElementById('et-preview').innerHTML")),
   'the preview fills the values in as it types');
// Not redrawn on every keystroke — that would take the cursor out of the field
// mid-word — so the marker appears when the panel is next drawn.
P.run("etRender()");
ok(/edited/.test(P.run("document.getElementById('et-body').innerHTML")), 'and the one changed is marked');
P.run("etReset()");
ok(P.run("etVal('rfi','subject')")==='[Fidevia] New RFI Submitted: {number}', 'putting it back restores what shipped');
ok(!P.run("!!PS_EMAIL.rfi"), 'with nothing left behind to save');

console.log('A project keeps its own wording');
P.run(`PS_EMAIL={rfi:{subject:'FIDEVIA WIDE'}}; FID_SETTINGS={emails:{rfi:{subject:'FIDEVIA WIDE'}}};
  currentProject.notif={rfi:{subject:'ITHACA ONLY'}};`);
ok(P.run("emailCfg('rfi').subject")==='ITHACA ONLY',
   'a project that customised its own is not rewritten by the Fidevia default');
P.run("currentProject.notif={};");
ok(P.run("emailCfg('rfi').subject")==='FIDEVIA WIDE', 'and everyone else follows Fidevia');
P.run("FID_SETTINGS={};");
ok(P.run("emailCfg('rfi').subject")==='[Fidevia] New RFI Submitted: {number}', 'falling back to what shipped');

console.log('The sends read it rather than a string in the middle of a function');
['deleted','schedule','reply','wf_action','wf_update','wf_override','pay_replaced'].forEach(id=>{
  ok(new RegExp("emailCfg\\('"+id+"'\\)").test(html), id+' is wired to the registry');
});
ok(/emailSubject\('access'/.test(fs.readFileSync('netlify/functions/box-proxy.mjs','utf8')),
   'and the server reads it for the ones it sends itself');

console.log('What the server will store');
ok(!S.cleanEmails(null) && !S.cleanEmails('x') && !S.cleanEmails([]), 'nothing is nothing');
ok(!S.cleanEmails({nope:{subject:'x'}}), 'an email the dashboard does not send is not stored');
ok(!S.cleanEmails({rfi:{colour:'red'}}), 'and only the subject and the opening line are');
ok(!S.cleanEmails({rfi:'Just a string'}) && !S.cleanEmails({rfi:['a']}) && !S.cleanEmails({rfi:null}),
   'an entry that is not a pair of fields is not one');
ok(S.cleanEmails({rfi:{subject:'A'}}).rfi.subject==='A', 'a real one is kept');
ok(S.cleanEmails({rfi:{subject:'A<script>x</script>'}}).rfi.subject==='A script x /script',
   'markup cannot be pasted into a subject header');
ok(S.cleanEmails({rfi:{subject:'A\nB'}}).rfi.subject==='A B', 'nor a second line');
ok(S.cleanEmails({rfi:{subject:'x'.repeat(500)}}).rfi.subject.length===200, 'and a subject has a ceiling');
ok(!S.cleanEmails({rfi:{subject:'   '}}), 'blank wording is no wording, so the default still applies');

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
