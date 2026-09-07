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
ok(/files\.sort/.test(op) && /localeCompare/.test(op), 'newest first');
ok(/when >= since/.test(op), 'and comparing against the start of the month');
ok(/'no-folder'/.test(op) && /'no-schedules-folder'/.test(op) && /'never'/.test(op),
   'the ways of having nothing are told apart');
ok(/created_at is the honest/.test(op), 'and why upload date is the measure');

// ── the panel ──
ok(/id="sched-uploads-panel"/.test(html), 'the Schedule tab shows it');
ok(/class="panel admin-only"/.test(html.split('id="sched-uploads-panel"')[0].slice(-60)),
   'to Fidevia only');
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

console.log((bad?'FAIL ':'ok   ')+'tools-test-schedchase.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
