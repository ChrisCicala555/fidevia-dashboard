// A schedule says which month it is for, and the panel says when it arrived.
// Those are different questions. The upload used to answer neither: it filed
// whatever was chosen under whatever month it happened to be, so a programme
// posted on the 30th for the month ahead counted as the current one, and
// re-posting last quarter's in October counted too.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
import { periodFromName, periodLabel, scheduleState, periodOfDate } from './netlify/functions/lib/sched.mjs';
const html = fs.readFileSync('index.html','utf8');
const prox = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const rem  = fs.readFileSync('netlify/functions/reminders.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

console.log('Reading a period back off a filename');
ok(periodFromName('Summit Builders — September 2026.pdf')==='2026-09', 'the name the dashboard writes');
ok(periodFromName('summit builders - march 2026.pdf')==='2026-03', 'case and dash style do not matter');
ok(periodFromName('Schedule 2026-09 rev B.pdf')==='2026-09', 'and a hand-typed 2026-09');
ok(periodFromName('Schedule 09-2026.pdf')==='2026-09', 'or 09-2026');
ok(periodFromName('Summit Builders schedule.pdf')==='', 'a name with no month yields none, rather than a guess');
ok(periodFromName('Baseline 2026.pdf')==='', 'and a bare year is not a month');
ok(periodLabel('2026-09')==='September 2026', 'and it reads back out again');

console.log('Whether this month has been handed over');
const f=(name,at)=>({name, created_at:at});
{
  const oct=f('Summit Builders — October 2026.pdf','2026-09-30T10:00:00Z');
  ok(scheduleState([oct],'2026-10','2026-10-01').state==='current',
     'next month’s programme posted early counts for next month');
  ok(scheduleState([oct],'2026-09','2026-09-01').state==='stale',
     'and does not also count for this one, which the upload date said it did');
  const old=f('Summit Builders — July 2026.pdf','2026-10-02T10:00:00Z');
  ok(scheduleState([old],'2026-10','2026-10-01').state==='stale',
     're-posting an old programme in October is not October’s');
  ok(scheduleState([old],'2026-10','2026-10-01').periodLabel==='July 2026',
     'and the panel is told which month it actually covers');
  ok(scheduleState([old],'2026-10','2026-10-01').date==='2026-10-02',
     'alongside the day it came in, which stays the submission date');
}
{
  // Everything uploaded before the period was asked for.
  const legacy=f('Summit Builders schedule.pdf','2026-09-02T10:00:00Z');
  ok(scheduleState([legacy],'2026-09','2026-09-01').state==='current',
     'a file with no period falls back to the upload date rather than being called missing');
  ok(scheduleState([legacy],'2026-09','2026-09-01').periodLabel==='',
     'and is not claimed to cover a month nobody recorded');
}
ok(scheduleState([],'2026-09','2026-09-01').state==='never', 'nothing at all is nothing at all');
{
  const both=[f('Summit Builders — August 2026.pdf','2026-08-01T10:00:00Z'),
              f('Summit Builders — September 2026.pdf','2026-09-01T10:00:00Z')];
  ok(scheduleState(both,'2026-08','2026-08-01').periodLabel==='August 2026',
     'the month being asked about is the one reported, not just the newest file');
}

console.log('One rule, both callers');
ok(/from '\.\/lib\/sched\.mjs'/.test(prox) && /from '\.\/lib\/sched\.mjs'/.test(rem),
   'the panel and the nightly chase read the same module');
ok(!/files\.sort\(\(a, b\) => String\(b\.created_at/.test(rem),
   'the chase no longer keeps its own copy of the rule');
// The bug that copy had been hiding.
ok(/shared = parties\.find\(f => f\.type === 'folder' && \/\^schedules\?\$\/i/.test(rem),
   'and it now reads the shared Schedules folder, which is where schedules go');
ok(/Schedule tab \\u2192 Monthly Schedules \\u2192 Upload/.test(rem),
   'so the email stops directing people to a per-company folder that was cleared out');
ok(/Schedule wanted for/.test(rem) && /Last one on file/.test(rem),
   'and names the month it wants and the month on file');

console.log('The dialog');
const b = bootPage('index.html'); b.run(SEED);
b.run(`currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'1',active:true}];
  SCHED_FOLDER_ID='555'; EXTERNAL=true; IS_ADMIN=false;
  currentProject.userCompany='Summit Builders'; currentProject.userRole='contractor'; DATA_READY=true;`);
b.run("openSchedUpload('Summit Builders')");
ok(b.run("document.getElementById('sched-backdrop').classList.contains('open')")===true, 'Upload opens it');
ok(/Summit Builders/.test(b.run("document.getElementById('sched-up-title').textContent")), 'named for the contract');
ok(b.run("schedUpPeriod()")===periodOfDate(new Date()).replace(/-(\d)$/,'-0$1'),
   'defaulting to the month we are in ('+b.run("schedUpPeriod()")+')');
ok(/2026/.test(b.run("document.getElementById('sched-up-year').innerHTML")), 'with a year to choose');
{
  const yrs=b.run("document.getElementById('sched-up-year').innerHTML").match(/>(\d{4})</g)||[];
  ok(yrs.length===3, 'last year through next — programmes get posted early and filed late');
}
b.run("document.getElementById('sched-up-month').value='10'; schedUpPreview();");
ok(b.run("schedUpLabel()")==='October 2026', 'the month can be changed');
ok(/October 2026/.test(b.run("document.getElementById('sched-up-name').textContent")),
   'and the dialog shows what the file will be called before it is sent');
// What it will not do.
b.run("document.getElementById('sched-up-status').textContent=''; submitSchedUpload()");
ok(/Choose the schedule file/.test(b.run("document.getElementById('sched-up-status').textContent")),
   'a period with no file is refused');
ok(b.run("document.getElementById('sched-backdrop').classList.contains('open')")===true,
   'and the dialog stays open rather than swallowing the attempt');
ok(/const name=safeFileName\(company\+' \\u2014 '\+periodLabel\)\+ext;/.test(html),
   'the upload writes the period the person chose, not today’s month');
ok(!/onchange="schedUpload\(this,/.test(html),
   'and nothing uploads the instant a file is picked any more');

console.log('The panel says both');
b.run(`IS_ADMIN=true; EXTERNAL=false; ME_COMPANY='Fidevia';
  SCHED_UPLOADS=[{company:'Summit Builders',state:'stale',period:'2026-07',periodLabel:'July 2026',date:'2026-07-19'}];`);
await b.run("renderScheduleUploads()");
{
  const out=b.run("document.getElementById('sched-uploads').innerHTML").replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  ok(/covers July 2026/i.test(out), 'which month the file on record is for');
  ok(/submitted 07\/19\/2026/.test(out), 'and the day it was submitted');
  ok(/No September 2026 schedule/.test(out), 'and what is missing, by name rather than "nothing this month"');
}
b.run("SCHED_UPLOADS=[{company:'Summit Builders',state:'current',date:'2026-09-02'}];");
await b.run("renderScheduleUploads()");
// With no period on the name there is no month to claim, so the summary says
// only when it arrived rather than inventing one.
{
  const out=b.run("document.getElementById('sched-uploads').innerHTML").replace(/<[^>]+>/g,' ');
  ok(/submitted 09\/02\/2026/.test(out) && !/covers /i.test(out),
     'an older file says when it came in and claims no month');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-schedperiod.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
