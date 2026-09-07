// Every email is written down, and a person can send the schedule chase by hand.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const rem  = fs.readFileSync('netlify/functions/reminders.mjs','utf8');
const log  = fs.readFileSync('netlify/functions/notif-log.mjs','utf8');
const mail = fs.readFileSync('netlify/functions/send-email.js','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ── the store ──
ok(/getStore\('notif-log'\)/.test(log), 'the log has its own store');
ok(/dayKey/.test(log) && /toISOString\(\)\.slice\(0, 10\)/.test(log), 'one blob per day');
ok(/MAX_PER_DAY/.test(log), 'a day cannot grow without bound');
ok(/onlyIfMatch/.test(log) && /onlyIfNew/.test(log),
   'concurrent sends compare-and-set rather than overwrite one another');
ok(/for \(let i = 0; i < 4; i\+\+\)/.test(log), 'and retry when they collide');
{
  const c = log.split('export async function logNotif')[1].split('export async function logSend')[0];
  ok(/try \{/.test(c) && /catch \(err\) \{\}/.test(c),
     'a failed write never breaks the send it was recording');
  ok(/if \(!entry\.to\.length\) return;/.test(c), 'an email to nobody is not an email');
}
{
  const c = log.split('function normalise')[1].split('export async function logNotif')[0];
  ok(/new Set/.test(c) && /toLowerCase/.test(c), 'recipients are de-duplicated and normalised');
  ok(/trigger: e\.trigger === 'manual' \? 'manual' : 'auto'/.test(c),
     'and a hand-sent email is told apart from an automatic one');
  ok(/ok: e\.ok !== false/.test(c), 'a failure is recorded, not dropped');
}
ok(/classifyKind/.test(log), 'the type is worked out from the subject when nobody names it');
{
  const c = log.split('export function classifyKind')[1].split('export const KIND_LABEL')[0];
  ['schedule','invite','access','workflow','digest','rfi','submittal','change-order','pay-app']
    .forEach(k => ok(new RegExp("'"+k+"'").test(c), 'it can name a '+k));
}
{
  const c = log.split('export async function readNotifLog')[1];
  ok(/Math\.min\(180/.test(c), 'a read is bounded in days');
  ok(/Math\.min\(2000/.test(c), 'and in rows');
  ok(/Promise\.all/.test(c), 'the days are fetched together, not one after another');
  ok(/opts\.projectId/.test(c) && /opts\.kind/.test(c), 'and can be narrowed to a project or a type');
  ok(/localeCompare/.test(c), 'newest first');
}

// ── every send path writes to it ──
ok(/await import\('\.\/notif-log\.mjs'\)/.test(mail),
   'the browser send path records, despite being CommonJS');
ok(/await record\(/.test(mail), 'on the way out');
ok(/ok: false, error: e\.message/.test(mail), 'and when it throws');
ok(/const ok = res\.status === 202;/.test(mail), 'a SendGrid refusal counts as a failure');
ok(/import \{ logNotif, readNotifLog \} from '\.\/notif-log\.mjs'/.test(srv),
   'the proxy imports it');
ok(/kind:'access'/.test(srv), 'a grant email is recorded');
ok(/kind:'access-request'/.test(srv), 'so is a request for access');
ok(/kind: 'archive'/.test(srv), 'so is the archive warning');
ok(/import \{ logNotif \} from '\.\/notif-log\.mjs'/.test(rem), 'the nightly job imports it');
{
  const c = rem.split('async function sendEmail')[1].split('function monthStart')[0];
  ok(/await logNotif\(/.test(c), 'and records every digest and chase it sends');
  ok(/r\.status === 202/.test(c), 'noting whether SendGrid took it');
}
ok(/kind: 'schedule', projectId/.test(rem), 'the chase is filed under the project it chased');
ok(/kind: 'digest', projectId/.test(rem), 'and so is the digest');

// ── who may read it ──
{
  const c = srv.split("if (op === 'notifLog')")[1].split('return json({ entries })')[0];
  ok(/if \(!who\.isAdmin\) return json\(\{ error: 'Admins only' \}, 403\)/.test(c),
     'only Fidevia may read the log');
}
ok(/not something a contractor may read about their rivals/.test(srv), 'and it says why');

// ── the log panel ──
ok(/id="nlog-body"/.test(html) && /Notification Log/.test(html), 'there is a panel for it');
ok(/id="nlog-scope"/.test(html) && /id="nlog-days"/.test(html) && /id="nlog-kind"/.test(html),
   'scoped by project, period and type');
{
  const c = html.split('async function loadNotifLog')[1].split('function renderNotifLog')[0];
  ok(/if\(!IS_ADMIN \|\| viewingAsExternal\(\)\) return;/.test(c),
     'the panel does not even ask when the viewer is not Fidevia');
  ok(/Could not read the log/.test(c), 'a failed read says so rather than looking empty');
  ok(/new Set\(NOTIF_LOG\.map/.test(c), 'the type filter offers only types actually present');
}
{
  const c = html.split('function renderNotifLog')[1].split('async function saveNotifSettings')[0];
  ok(/Nothing sent in this period/.test(c), 'an empty period says so');
  ok(/r\.ok===false/.test(c), 'a failed send is visibly marked');
  ok(/title="'\+esc\(to\.join\(', '\)\)\+'"/.test(c),
     'a long recipient list stays recoverable rather than being truncated away');
}
ok(/loadReminderSettings\(\);\s*\n\s*loadNotifLog\(\);/.test(html),
   'it loads when the notifications settings open');

// ── the browser passes context along ──
{
  const c = html.split('async function sendEmail(toEmails, subject, body, opts)')[1].split('\n}')[0];
  ok(/kind:opts\.kind\|\|''/.test(c), 'the caller may name the kind');
  ok(/projectId:\(currentProject&&currentProject\.folderId\)\|\|''/.test(c),
     'the project is attached without the caller having to');
  ok(/by:opts\.by\|\|ME_NAME\|\|ME_EMAIL\|\|''/.test(c), 'and who was signed in');
}
ok(/kind:opts\.kind, trigger:opts\.trigger, by:opts\.by/.test(html),
   'notifyContacts passes it through rather than swallowing it');

// ── sending the chase by hand ──
ok(/function schedChaseTargets\(\)/.test(html), 'the recipients are worked out in one place');
{
  const c = html.split('function schedChaseTargets()')[1].split('function schedChaseFooter')[0];
  ok(/r\.state!=='current'/.test(c), 'only contracts that are behind');
  ok(/norm\(c\['Company'\]\)===norm\(r\.company\)/.test(c), 'their people, from the project contact sheet');
  ok(/new Set/.test(c), 'each person once');
  ok(/\.filter\(r=>r\.emails\.length\)/.test(c), 'a company with no addresses is not a target');
}
{
  const c = html.split('async function sendScheduleChaseNow()')[1].split('\n}\nfunction scheduleStats')[0];
  ok(/if\(!IS_ADMIN \|\| viewingAsExternal\(\)\) return;/.test(c), 'only Fidevia may send it');
  ok(/if\(!targets\.length\) return;/.test(c), 'and not to nobody');
  ok(/confirm\(/.test(c), 'the list is confirmed before anything goes out');
  ok(/kind:'schedule', trigger:'manual'/.test(c), 'the send is filed as a hand-sent chase');
  ok(/recordScheduleSend/.test(c), 'and stamped so the panel can say when');
  ok(/auditLog\('Sent schedule reminder'/.test(c), 'the action is audited as well as logged');
  ok(/emailTemplate\(/.test(c), 'it uses the house email, not a bare message');
}
{
  const c = html.split('function schedChaseFooter()')[1].split('// Sending by hand')[0];
  ok(/Everyone is current, so there is nobody to chase/.test(c),
     'the button explains itself when there is nothing to do');
  ok(/Nobody behind has an email address/.test(c),
     'and distinguishes that from having nobody to send to');
  ok(/disabled/.test(c), 'and is disabled rather than failing when pressed');
  ok(/No manual reminder has been sent from here yet/.test(c), 'the record reads as empty, not absent');
}
ok(/lastScheduleSend/.test(srv), 'the stamp is kept server-side');
{
  const c = srv.split("if (op === 'recordScheduleSend')")[1].split("// ---- NOTIFICATION LOG ----")[0];
  ok(/if \(!who\.isAdmin\)/.test(c), 'only Fidevia may stamp it');
  ok(/by: who\.email/.test(c), 'and the name recorded is the caller the server verified, not one they supplied');
}
{
  const c = srv.split("if (op === 'saveReminderSettings')")[1].split("if (op === 'recordScheduleSend')")[0];
  ok(/prev\.lastScheduleSend/.test(c),
     'saving the settings form does not erase the record of what was already sent');
}
ok(/if \(who\.isAdmin && rs\.lastScheduleSend\)/.test(srv),
   'and a contractor is not told about the administration of their chasing');

// ── the automatic chase looks like the rest of the mail ──
{
  const c = rem.split('function scheduleChaseHTML')[1].split('const notDone')[0];
  ok(/fidevia-email-logo\.png/.test(c), 'the chase carries the letterhead');
  ok(/esc =/.test(c) && /replace\(\/<\/g/.test(c), 'and escapes the company name it was given');
}

console.log((bad?'FAIL':'ok  '),' tools-test-notiflog.mjs —',n,'assertions');
process.exit(bad?1:0);
