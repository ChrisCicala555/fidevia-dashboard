// Schedule counters on a project that has not started.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const fn = html.split('function scheduleStats')[1].split('// Feeds the Home KPI header')[0];
ok(/started = today>=start/.test(fn), 'whether the project has started is worked out');
ok(/finished = today>end/.test(fn), 'and whether it is past the end');
ok(/if\(!started\)\{\s*expended=0; remaining=duration; pct=0;/.test(fn),
   'before the start nothing is expended and the whole duration remains');
ok(/remaining=Math\.max\(0, Math\.round\(\(end-today\)/.test(fn),
   'remaining cannot go negative once the end date passes');
ok(/read\s*\n\s*\/\/ as though time were owed back/.test(fn) || /negative days expended/.test(fn),
   'the reason is recorded');

ok(/const notYet = \(s\.started===false\)/.test(html), 'the display checks it explicitly');
ok(/card\('Days Expended', notYet \? 'N\/A'/.test(html), 'Days Expended reads N/A before the start');
ok(/card\('% Expended', notYet \? 'N\/A'/.test(html), '% Expended does too');
ok(/'% Time Elapsed', s\.started===false \? 'N\/A'/.test(html), 'and the Home header agrees');
ok(/Not started — construction begins/.test(html), 'a line says when it starts');
ok(/Past the contract completion date/.test(html), 'and flags a project past its end date');

// the arithmetic
{
  const stats=(startS,endS,todayS)=>{
    const start=new Date(startS), end=new Date(endS), today=new Date(todayS);
    const duration=Math.round((end-start)/86400000);
    const started=today>=start, finished=today>end;
    let expended,remaining,pct;
    if(!started){ expended=0; remaining=duration; pct=0; }
    else { expended=Math.round((today-start)/86400000);
           remaining=Math.max(0,Math.round((end-today)/86400000));
           pct=duration>0?Math.min(1,Math.max(0,expended/duration)):0; }
    return {duration,expended,remaining,pct,started,finished};
  };
  // the reported case: starts 14 Sep 2026, viewed 24 Aug 2026
  const a=stats('2026-09-14','2026-12-31','2026-08-24');
  ok(a.started===false, 'a future start is not started');
  ok(a.expended===0, 'expended is 0 rather than -21');
  ok(a.remaining===a.duration, 'the whole duration remains (got '+a.remaining+' of '+a.duration+')');
  ok(a.pct===0, 'and nothing is elapsed');

  const b=stats('2026-01-01','2026-12-31','2026-07-01');
  ok(b.started===true && b.expended>0 && b.remaining>0, 'a running project is unchanged');
  ok(b.expended+b.remaining===b.duration, 'expended and remaining still sum to the duration');

  const c=stats('2026-01-01','2026-06-30','2026-12-01');
  ok(c.finished===true, 'past the end is flagged');
  ok(c.remaining===0, 'remaining floors at zero rather than going negative');
  ok(c.pct===1, 'and elapsed caps at 100%');

  const d=stats('2026-09-14','2026-12-31','2026-09-14');
  ok(d.started===true && d.expended===0, 'the first day counts as started, with nothing yet expended');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-schedstats.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
