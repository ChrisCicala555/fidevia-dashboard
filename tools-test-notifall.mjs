// The Notification Log showed only access grants. Everything the browser sends
// — every submittal, RFI, change order, deletion, invitation and workflow
// notice — goes through send-email, and send-email was the one send path that
// reached the log through a dynamic import out of a CommonJS function, inside
// a catch that swallowed the failure. It did not record, and it did not say so.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const send = fs.readFileSync('netlify/functions/send-email.mjs','utf8');

console.log('Every sender reaches the log the same way');
ok(!fs.existsSync('netlify/functions/send-email.js'),
   'send-email is no longer the odd CommonJS one out');
for (const f of ['send-email.mjs','box-proxy.mjs','reminders.mjs']) {
  const src = fs.readFileSync('netlify/functions/'+f,'utf8');
  ok(/^import \{[^}]*logNotif[^}]*\} from '\.\/lib\/notif-log\.mjs';$/m.test(src),
     f+' imports the log statically, the way the two that worked always did');
}
ok(!/await import\('\.\/lib\/notif-log\.mjs'\)/.test(send),
   'and nothing reaches it through a dynamic import any more');
ok(/console\.error\('\[send-email\] notification log write failed:'/.test(send),
   'a failure to record says so rather than vanishing into an empty catch');
ok(/return json\(\{ ok, logged \}/.test(send),
   'and the caller is told whether it was recorded');
ok(/ok \? \{ ok: true \} : \{ ok: false, error: 'SendGrid ' \+ res\.status \}/.test(send),
   'a refused send is recorded with its reason, not dropped');

console.log('One funnel, and it carries the context');
{
  const direct=(html.match(/functions\/send-email/g)||[]).length;
  ok(direct===1, 'the browser has exactly one place that posts an email ('+direct+')');
  const c = html.split('async function sendEmail')[1].split('\nfunction ')[0];
  ok(/projectId:\(currentProject&&currentProject\.folderId\)\|\|''/.test(c),
     'which attaches the project, so "This project" can find it');
  ok(/project:\(currentProject&&currentProject\.name\)\|\|''/.test(c), 'and its name');
  ok(/by:opts\.by\|\|ME_NAME\|\|ME_EMAIL\|\|''/.test(c), 'and who pressed the button');
}

console.log('What the log does with what send-email writes');
// The real logNotif and readNotifLog against a stand-in blob store, given an
// entry shaped exactly as send-email builds one.
{
  const mem = new Map();
  const fake = {
    async getWithMetadata(k){ return mem.has(k) ? {data:mem.get(k), etag:'e'+mem.get(k).length} : null; },
    async get(k){ return mem.get(k) || null; },
    async setJSON(k,v){ mem.set(k,v); return {modified:true}; }
  };
  const mod = fs.readFileSync('netlify/functions/lib/notif-log.mjs','utf8')
    .replace("import { getStore } from '@netlify/blobs';", 'const getStore=()=>globalThis.__FAKE_STORE__;');
  fs.writeFileSync('.nl.tmp.mjs', mod);
  globalThis.__FAKE_STORE__ = fake;
  const L = await import('./.nl.tmp.mjs');

  const sends = [
    {subject:'[Fidevia] New Submittal Submitted: SUB-GO-001', kind:''},
    {subject:'[Fidevia] New RFI Submitted: RFI-004',          kind:''},
    {subject:'[Fidevia] New Change Order Submitted: CO-002',  kind:''},
    {subject:'[Fidevia] Action required: Submittal awaits your review', kind:''},
    {subject:'[Fidevia] Record deleted: RFI RFI-002',         kind:''},
    {subject:'You’re invited to the Fidevia Dashboard',  kind:''},
    {subject:'[Fidevia] Monthly schedule due — Ithaca',  kind:''}
  ];
  for (const s of sends) {
    await L.logNotif({to:['a@x.test'], subject:s.subject, kind:s.kind,
      trigger:'auto', projectId:'900', project:'Ithaca Housing Complex', by:'Christopher Cicala', ok:true});
  }
  // Another project's send, to prove the scope filter is doing something.
  await L.logNotif({to:['b@y.test'], subject:'[Fidevia] New RFI Submitted: RFI-100',
    projectId:'901', project:'Somewhere Else', ok:true});

  const mine = await L.readNotifLog({days:30, projectId:'900'});
  ok(mine.length===sends.length, 'every kind of send comes back for the project ('+mine.length+' of '+sends.length+')');
  const kinds = mine.map(r=>r.kind).sort();
  for (const want of ['submittal','rfi','change-order','workflow','deletion','invite','schedule'])
    ok(kinds.includes(want), 'a '+want+' notification is classified and kept');
  ok(!mine.some(r=>r.projectId==='901'), 'and another project’s send is not in this project’s log');
  const all = await L.readNotifLog({days:30});
  ok(all.length===sends.length+1, 'while All projects shows both');
  ok((await L.readNotifLog({days:30, projectId:'900', kind:'rfi'})).length===1,
     'and the type filter narrows to one kind');
  ok(mine.every(r=>r.ok===true), 'a successful send is recorded as successful');
  await L.logNotif({to:['c@z.test'], subject:'[Fidevia] New RFI Submitted: RFI-9',
    projectId:'900', ok:false, error:'SendGrid 401'});
  const withFail = await L.readNotifLog({days:30, projectId:'900'});
  ok(withFail.some(r=>r.ok===false && /401/.test(r.error||'')),
     'and a refused one is recorded as refused, with the reason');
  fs.unlinkSync('.nl.tmp.mjs');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-notifall.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
