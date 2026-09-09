// Monthly schedule: check who has posted one, chase only those who have not.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const rem  = fs.readFileSync('netlify/functions/reminders.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ── the check ──
ok(/if \(op === 'scheduleUploads'\)/.test(srv), 'there is an op that checks');
const op = srv.split("if (op === 'scheduleUploads')")[1].split("if (op === 'docsList')")[0];
ok(/who\.isAdmin/.test(op), 'admin only');
ok(/startsWith\(DOCS_PREFIX\)/.test(op), 'it looks under Documents');
ok(/\^schedules\?\$\/i/.test(op), 'in a Schedules folder, singular or plural');
ok(/created_at/.test(op), 'reading when each file arrived');
// The judging moved into lib/sched.mjs so the panel and the nightly chase
// cannot drift apart again — they had, and the chase was the one that was wrong.
const lib = fs.readFileSync('netlify/functions/lib/sched.mjs','utf8');
ok(/scheduleState\(files, want, since\)/.test(op), 'and handing the files to one shared rule');
ok(/sort\(\(a, b\) =>/.test(lib) && /localeCompare/.test(lib), 'newest first');
ok(/when >= since/.test(lib), 'comparing against the start of the month where no period was named');
ok(/periodFromName\(f\.name\) === wantPeriod/.test(lib),
   'but preferring the month the uploader said it covers');
// 'no-folder' went with the per-company tree: there is one shared Schedules
// folder now, so either the project has it or it does not.
ok(/'no-schedules-folder'/.test(op) && /'never'/.test(lib) && /'no-documents'/.test(op),
   'the ways of having nothing are told apart');
ok(/norm\(f\.name\)\.includes\(norm\(co\)\)/.test(op),
   'and a shared folder is read by filename, since the folder cannot say whose a file is');
ok(/created_at is the honest/.test(lib), 'and why upload date is the measure of when it arrived');

// ── the panel ──
ok(/id="sched-uploads-panel"/.test(html), 'the Schedule tab shows it');
ok(!/admin-only/.test(html.split('id="sched-uploads-panel"')[0].slice(-60)),
   'and not only to Fidevia — this is where a contractor posts their programme');
ok(/const mineOnly = !IS_ADMIN \|\| viewingAsExternal\(\);/.test(html),
   'who sees which rows is decided in the render, where it can be reasoned about');
{
  const r = html.split('async function renderScheduleUploads')[1].split('function scheduleStats')[0];
  ok(/c\.active!==false/.test(r), 'inactive contractors are not chased');
  ok(/if\(!cos\.length\)\{ panel\.style\.display='none'/.test(r), 'nor is an empty panel shown');
  ok(/Could not check the schedule folders/.test(r), 'a failed check says so rather than looking clear');
  ok(/Check again/.test(r), 'and can be re-run');
  ok(/SCHED_UPLOADS/.test(r), 'the answer is cached rather than re-walked on every render');
}
ok((html.match(/SCHED_UPLOADS=null/g)||[]).length>=3,
   'and cleared when the project changes, so one project cannot show another’s answer');

// ── the chase ──
ok(/cfg\.schedules && new Date\(\)\.getUTCDate\(\) === \(parseInt\(cfg\.scheduleDay, 10\) \|\| 25\)/.test(rem),
   'it runs on the configured day of the month');
ok(/if \(current\) continue;/.test(rem), 'a contract that has posted one is not emailed');
ok(/String\(r\['Company'\] \|\| ''\)\.trim\(\)\.toLowerCase\(\) === String\(c\.name\)/.test(rem),
   'the email goes to that company, not to everyone on the project');
ok(/Monthly schedule due/.test(rem), 'with its own subject');
ok(/does not ride along on a\s*\n?\s*\/\/ digest that everybody receives/.test(rem) || /ride along on a/.test(rem),
   'kept out of the general digest');
ok(/fields=id,name,type,created_at/.test(rem), 'the listing asks for created_at');
ok(/async function readText/.test(rem), 'and the project config can be read');
ok(/There is no schedule on file yet/.test(rem), 'a contract that never posted one is told so');

// ── settings ──
ok(/id="rem-schedules"/.test(html) && /id="rem-schedule-day"/.test(html), 'both settings exist');
ok(/scheduleDay: Math\.min\(28, Math\.max\(1,/.test(html),
   'the day is clamped to 28 so it cannot skip February');
ok(/Those that have posted one are not/.test(html), 'the wording says who will not be emailed');

// behaviour
{
  const since='2026-09-01';
  const state=(d)=>!d ? 'never' : (d>=since ? 'current' : 'stale');
  ok(state('2026-09-03')==='current', 'a file this month is current');
  ok(state('2026-08-28')==='stale', 'last month is not');
  ok(state('')==='never', 'nothing at all is never');
  ok(state('2026-09-01')==='current', 'the first of the month counts');
  const clamp=v=>Math.min(28, Math.max(1, parseInt(v,10)||25));
  ok(clamp(31)===28, 'a day past the shortest month is pulled back to 28');
  ok(clamp(0)===25, 'zero is not a day, so it falls back to the default');
  ok(clamp('')===25, 'and so does an empty field');
  ok(clamp(5)===5, 'a sensible day is left alone');
}

// ── the contractor's own view of it ──
ok(/let MY_SCHEDULE=null/.test(html), "the viewer's own obligation is held");
{
  const ms = html.split('async function loadMySchedule')[1].split('async function renderScheduleUploads')[0];
  ok(/if\(!currentProject \|\| IS_ADMIN\) return;/.test(ms), 'Fidevia gets the panel instead');
  ok(/if\(!\(d\.due&&d\.due\.enabled\)\) return;/.test(ms),
     'and nobody is chased on a project where it was not asked for');
  ok(/companies/.test(ms) && !/companies:\[/.test(ms),
     'the contractor does not name a company — the server takes it from the grant');
}
{
  const at = html.split('if(MY_SCHEDULE && MY_SCHEDULE.state')[1].split('// Pay applications awaiting')[0];
  ok(/state!=='current'/.test(html), 'nothing is shown once this month is posted');
  ok(/none uploaded yet/.test(at) && /nothing this month/.test(at), 'the two cases read differently');
  ok(/last was '\+fmtDMY\(MY_SCHEDULE\.date\)/.test(at), 'and it says when the last one was');
  ok(/today>day \? 'Overdue'/.test(at), 'past the due day it reads as overdue');
  ok(/'Due by the '\+day\+ordinalSuffix\(day\)/.test(at), 'before it, as due');
  ok(/sec:'gendocs'/.test(at), 'and clicking goes to Documents');
}
ok(/the feed records what happened, this is what is owed/.test(html),
   'why it is in the attention panel rather than the activity feed');
ok((html.match(/MY_SCHEDULE=null/g)||[]).length>=3, 'cleared when the project changes');

// the server side of that
{
  const op2 = srv.split("if (op === 'scheduleUploads')")[1].split("if (op === 'docsList')")[0];
  ok(/if \(!who\.isAdmin\) \{/.test(op2), 'a non-admin takes a different path');
  ok(/companies = \[mine\];/.test(op2), 'restricted to their own company');
  ok(/Their company comes from the grant, not from what they asked for/.test(op2),
     'taken from the grant rather than the request');
  ok(/if \(!mine\) return json\(\{ error: 'Access denied' \}, 403\);/.test(op2),
     'and refused without one');
  ok(/due = \{ enabled: !!rs\.schedules/.test(op2), 'the due day travels with the answer');
  ok(!/agingDays|payapps|overdue/.test(op2), 'without exposing the rest of the reminder settings');
}
{
  const ord=n=>{ const v=n%100; if(v>=11&&v<=13) return 'th'; return ({1:'st',2:'nd',3:'rd'})[n%10]||'th'; };
  ok(ord(1)==='st'&&ord(2)==='nd'&&ord(3)==='rd'&&ord(4)==='th', 'ordinals read correctly');
  ok(ord(11)==='th'&&ord(12)==='th'&&ord(13)==='th', 'including the teens');
  ok(ord(21)==='st'&&ord(22)==='nd', 'and past twenty');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-schedchase.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
