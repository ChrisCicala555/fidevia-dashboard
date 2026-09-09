// A contractor should be told on their Home page that a programme is owed —
// but only once the job is authorised to start, and only for a month that is
// actually missing.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const att=()=>b.run("document.getElementById('attention-panel').innerHTML").replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
const set=(ms, sched, extra)=>b.run(`
  EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='g@g.test'; ME_NAME='';
  currentProject.userCompany='Gorilla Construction'; currentProject.userRole='contractor'; DATA_READY=true;
  currentProject.config.contractors=[{name:'Gorilla Construction',role:'Sub',contract:'1',active:true}];
  currentProject.config.milestones=${JSON.stringify(ms)};
  allData.rfi=[];allData.co=[];allData.sub=[];allData.pay_apps=[];
  MY_SCHEDULE=${JSON.stringify(sched)}; ${extra||''} renderAll();`);
const NOT_YET=[{name:'Notice to Proceed',contract:'2026-09-14'},{name:'Mobilize / Start Onsite',contract:'2026-09-21'},{name:'Substantial Completion',contract:'2026-12-31'}];
const STARTED=[{name:'Notice to Proceed',contract:'2026-06-01'},{name:'Mobilize / Start Onsite',contract:'2026-06-15'},{name:'Substantial Completion',contract:'2026-12-31'}];
const NEVER={state:'never',due:{enabled:false,day:25}};
const STALE={state:'stale',periodLabel:'July 2026',date:'2026-07-19',due:{enabled:false,day:25}};
const CURRENT={state:'current',periodLabel:'September 2026',date:'2026-09-02',due:{enabled:true,day:25}};

console.log('When it is owed');
set(NOT_YET, NEVER);
ok(!/Monthly schedule/.test(att()),
   'a job that has not been authorised to start asks for nothing');
set(STARTED, NEVER);
ok(/Monthly schedule — none submitted yet/.test(att()), 'once it has started, a contract with none on file is asked');
set(STARTED, STALE);
{
  const out=att();
  ok(/no September 2026 programme/.test(out), 'and the month being asked for is named ('+out.match(/Monthly schedule[^<]*/)+')');
  ok(/last covers July 2026/.test(out), 'alongside what is actually on file');
}
set(STARTED, CURRENT);
ok(!/Monthly schedule/.test(att()), 'a contract that has posted this month is not chased');
set([], NEVER);
ok(!/Monthly schedule/.test(att()),
   'and a project with no milestones recorded cannot say either way, so it does not guess');

console.log('The date it turns on');
b.run(`currentProject.config.milestones=${JSON.stringify(STARTED)}`);
ok(b.run("scheduleObligationStart().toISOString().slice(0,10)")==='2026-06-01',
   'the earlier of Notice to Proceed and Mobilize — a programme is owed from the first of them');
b.run(`currentProject.config.milestones=[{name:'Mobilize / Start Onsite',contract:'2026-06-15'}]`);
ok(b.run("scheduleObligationStart().toISOString().slice(0,10)")==='2026-06-15',
   'either one alone will do');
b.run(`currentProject.config.milestones=[]`);
ok(b.run("scheduleObligationStart()")===null, 'and neither means no answer, rather than a default');
ok(b.run("scheduleObligationStarted()")===null, 'which is not the same as "no"');

console.log('What it is not gated on');
{
  const c = html.split('async function loadMySchedule')[1].split('\nasync function ')[0];
  ok(!/if\(!\(d\.due&&d\.due\.enabled\)\) return;/.test(c),
     'the email chase toggle no longer decides whether the dashboard mentions it');
  ok(/MY_SCHEDULE=Object\.assign\(\{\}, row, \{due:d\.due\|\|\{\}\}\)/.test(c),
     'the due day still comes through, for the wording');
}
// Both states were reachable with the toggle off, and neither said anything.
set(STARTED, NEVER);
ok(/Monthly schedule/.test(att()), 'so a contract is told even where Fidevia sends no chase emails');

console.log('Where it points');
// Anchored on the code, not on the phrase: "Monthly schedule uploads" is a
// comment heading hundreds of lines earlier, and splitting on it read the
// wrong part of the file entirely.
{
  const c = html.split("MY_SCHEDULE.state!=='current'")[1].slice(0, 1200);
  ok(/sec:'schedule'\}\);/.test(c), 'the line goes to the Schedule tab, which is where schedules now are');
  ok(!/sec:'gendocs'/.test(c), 'not to Documents, which no longer holds them');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-schedremind.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
