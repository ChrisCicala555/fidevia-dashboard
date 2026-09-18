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
    const v=JSON.parse(P.run(`JSON.stringify(etSample(EMAIL_KINDS[${i}]))`));
    k.vars.forEach(x=>{ if(!(x.slice(1,-1) in v)) unknown.push(id+' '+x); });
  });
  ok(unknown.length===0, 'and the preview can fill in every one ('+unknown.join(', ')+')');
}

console.log('The preview shows values that belong to that email');
// One shared sample previewed a change order as "New Change Order: RFI-014",
// which reads as a fault in the dashboard rather than a placeholder.
{
  const wrong=[];
  ids.forEach((id,i)=>{
    P.run(`PS_EMAIL={}; etGo(${i});`);
    const txt=P.run("document.getElementById('et-preview').innerHTML").replace(/<[^>]+>/g,' ');
    // No email but the RFI ones should be showing an RFI number.
    if(!/^(rfi|wf_override|deleted)$/.test(id) && /RFI-014/.test(txt)) wrong.push(id);
    // Nothing should preview with an unfilled brace.
    if(/\{\w+\}/.test(txt)) wrong.push(id+' (unfilled)');
  });
  ok(wrong.length===0, 'no email borrows another\u2019s number ('+wrong.join(', ')+')');
}
{
  const num=(i)=>{ P.run(`PS_EMAIL={}; etGo(${i});`);
    return P.run("document.getElementById('et-preview').innerHTML").replace(/<[^>]+>/g,' '); };
  ok(/PCO-007/.test(num(ids.indexOf('co'))), 'a change order previews as a PCO number');
  ok(/CO-003/.test(num(ids.indexOf('co_issued'))), 'an issued one as a CO number');
  ok(/SUB-GC-008/.test(num(ids.indexOf('sub'))), 'a submittal as a submittal number');
  ok(/PA-004/.test(num(ids.indexOf('pay_apps'))), 'a payment application as an application number');
  ok(/RFI-014/.test(num(ids.indexOf('rfi'))), 'and an RFI as an RFI number');
  ok(/Stone masonry/.test(num(ids.indexOf('sub'))), 'with a title that suits it too');
  ok(/site lighting/.test(num(ids.indexOf('co'))), 'on both');
}
{
  // Every kind that takes {number} or {title} says what its own looks like,
  // so a kind added later cannot quietly fall back to another's.
  const bare=[];
  ids.forEach((id,i)=>{
    const k=JSON.parse(P.run(`JSON.stringify(EMAIL_KINDS[${i}])`));
    const uses=(k.subject+' '+k.intro).match(/\{(number|title|item)\}/g)||[];
    if(uses.length && !(k.sample && (k.sample.number||k.sample.title||k.sample.item))) bare.push(id);
  });
  ok(bare.length===0, 'and every kind using a number, title or item brings its own ('+bare.join(', ')+')');
}
{
  // The shared fallback must not look like a real value: a kind that forgets
  // its sample should read as unfinished, not as the wrong item type.
  const base=JSON.parse(P.run("JSON.stringify(etSample(null))"));
  ok(!/^(RFI|Submittal|Change Order|Payment Application)$/.test(base.item),
     'the fallback item type is a placeholder, not a real one');
  ok(!/^[A-Z]{2,}-\d+/.test(base.number||''), 'and the fallback number is not a plausible number');
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

console.log('The sends actually run, and say what they mean');
// Added after shipping a break: the tests inspected the source and the preview
// and never ran a send, so a server-only helper called from the browser and a
// substituter that knew four fill-ins out of sixteen both got through. These
// drive the paths.
{
  const P2=bootPage('index.html'); P2.run(SEED);
  P2.run(`window.__sent=[]; sendEmail=function(to,subj){ window.__sent.push(subj); return Promise.resolve(); };
    currentProject.name='Ithaca Housing Complex'; 1;`);
  const drive=(label, js)=>{
    P2.run("window.__sent=[];");
    let threw='';
    try{ P2.run(js); }catch(e){ threw=e.message; }
    const got=JSON.parse(P2.run("JSON.stringify(window.__sent)"));
    ok(!threw, label+' does not throw ('+threw+')');
    ok(got.length===1, label+' sends');
    ok(!/[{}]/.test(got[0]||''), label+' has no fill-in left in the subject: '+(got[0]||''));
    return got[0]||'';
  };
  drive('a deletion', "var _c=emailCfg('deleted'); sendEmail(['x'], applyVars(_c.subject,{project:currentProject.name,item:'RFI',number:'RFI-014',who:'Sophie'}));");
  drive('a schedule chase', "var _c=emailCfg('schedule'); sendEmail(['x'], applyVars(_c.subject,{project:currentProject.name,company:'Summit Builders',period:schedMonthLabel()}));");
  drive('a reply', "var _c=emailCfg('reply'); sendEmail(['x'], applyVars(_c.subject,{project:currentProject.name,item:'Submittal',number:'SUB-1',status:'Approved'}));");
  drive('an action request', "var _c=emailCfg('wf_action'); sendEmail(['x'], applyVars(_c.subject,{project:currentProject.name,item:'Submittal',number:'SUB-1',step:'Architect Review',firm:'Architect 2'}));");
  drive('a workflow move', "var _c=emailCfg('wf_update'); sendEmail(['x'], applyVars(_c.subject,{project:currentProject.name,item:'RFI',number:'RFI-1',firm:'Moore'}));");
  drive('an override', "var _c=emailCfg('wf_override'); sendEmail(['x'], applyVars(_c.subject,{project:currentProject.name,item:'RFI',number:'RFI-1',outcome:'Answered',who:'Fidevia'}));");
  drive('a replaced pay app', "var _c=emailCfg('pay_replaced'); sendEmail(['x'], applyVars(_c.subject,{project:currentProject.name,number:'PA-4'}));");
}

console.log('Every fill-in the registry declares is one applyVars can fill');
{
  const v={}; const all=[];
  ids.forEach((id,i)=>{ JSON.parse(P.run(`JSON.stringify(EMAIL_KINDS[${i}].vars)`)).forEach(x=>all.push(x)); });
  [...new Set(all)].forEach(x=>{ v[x.slice(1,-1)]='VALUE'; });
  const out=P.run(`applyVars(${JSON.stringify([...new Set(all)].join('|'))}, ${JSON.stringify(v)})`);
  ok(!/[{}]/.test(out), 'no declared fill-in is left as a brace: '+out.slice(0,80));
}
ok(P.run("applyVars('a {nope} b', {})")==='a b',
   'and one nothing was supplied for is removed rather than posted to a client');
ok(P.run("applyVars('a {b} c')")==='a c',
   'called with no values at all it still returns a subject rather than throwing');

console.log('No send path calls something that only exists on the server');
{
  const serverOnly=['periodLabel','periodOfDate','digestHTML','scheduleChaseHTML','logNotif','boxFetch'];
  const missing=serverOnly.filter(f=>new RegExp('[^.\\w]'+f+'\\s*\\(').test(html) && !new RegExp('function '+f).test(html));
  ok(missing.length===0, 'the browser calls none of them ('+missing.join(', ')+')');
}

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
