// "But what about the payment application?"
//
// PA-001 was on Fidevia's attention panel with no due date. Change orders have
// no due date field at all — fair enough, and Christopher has said to leave them
// that way. A payment application is different: it has the column, and this one
// was empty.
//
// It came in through the contractor-upload path, which wrote a blank because an
// uploaded pencil copy arrives with no period attached. So the one item on that
// panel which genuinely had a deadline showed none, and Fidevia's own review had
// no clock on it until somebody opened the row and typed a period in.
//
// The deadline does not depend on the period being recorded. It is the formal
// application date for the cycle it arrived in — already configured on the
// project, already shown to everybody in the billing bar.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`currentProject.config.billing={pencilDay:20,formalDay:25};`);
const row=(o)=>Object.assign({'App #':'PA-001','Contractor':'Summit Builders','Company':'Summit Builders',
  'Due Date':'','Period':'','Status':'Uploaded — awaiting Fidevia',
  'Version History':JSON.stringify([{v:1,date:'2026-09-03'}])}, o);
const due=(o)=>P.run('payDueDate('+JSON.stringify(row(o))+')');

console.log('An application uploaded with no period');
ok(due({})==='2026-09-25', 'takes the formal application date for the cycle it arrived in — got '+due({}));
ok(due({'Version History':JSON.stringify([{v:1,date:'2026-09-27'}])})==='2026-10-25',
   'and rolls to the next cycle when it arrived after this one had passed');
ok(due({'Version History':JSON.stringify([{v:1,date:'2026-09-25'}])})==='2026-09-25',
   'arriving on the day itself is still that day, not the next month');
ok(due({'Version History':JSON.stringify([{v:1,date:'2026-12-28'}])})==='2027-01-25',
   'and rolling over a year end lands in January');

console.log('What it must not override or invent');
ok(due({'Due Date':'2026-10-05'})==='2026-10-05', 'a date already on the row is left exactly alone');
ok(due({'Period':'2026-08-01'})==='2026-08-25', 'a recorded period decides the cycle, ahead of the arrival date');
{
  // billingCycle() falls back to the 20th and 25th so the rest of the screen has
  // something to draw. Deriving a deadline from a figure nobody chose is the
  // invented date Christopher declined for change orders, so it is not done.
  const noCfg=P.run(`(function(){ const b=currentProject.config.billing; currentProject.config.billing=null;
    const x=payDueDate(${JSON.stringify(row({}))}); currentProject.config.billing=b; return x; })()`);
  ok(noCfg==='', 'a project with no billing cycle set offers no deadline — got '+JSON.stringify(noCfg));
  const dflt=P.run(`(function(){ const b=currentProject.config.billing; currentProject.config.billing=null;
    const x=payUploadDue(); currentProject.config.billing=b; return x; })()`);
  ok(dflt==='', 'and an upload there records nothing rather than the fallback figure');
}
ok(due({'Version History':'not json'})!=='', 'a corrupt version history falls back to today rather than giving up');
ok(P.run(`payDueDate(null)`)==='' || typeof P.run(`payDueDate(null)`)==='string',
   'and a missing row is handled');

console.log('It reaches the panel');
{
  const r=html.slice(html.indexOf('function renderAttention'), html.indexOf('// ── ARCHIVING COMPLETED'));
  ok(/due:payDueDate\(r\), badge:'Awaiting review'/.test(r),
     'the rule for applications awaiting Fidevia asks for the derived date');
  ok(/due:\(key==='pay_apps'\) \? payDueDate\(r\) : \(r\['Due Date'\]\|\|''\)/.test(r),
     'and so does the workflow rule, which is the one that drew the row in the screenshot');
  ok(!/due:r\['Due Date'\]\|\|'', badge:'Awaiting review'/.test(r), 'the bare column read is gone');
}

console.log('And the column is filled at upload');
{
  // Anchored on the call itself. The status beside it became a ternary when the
  // pencil/final choice went in, so a slice measured from that string moved.
  const u=html.slice(html.indexOf("} else if(currentModal==='payapp_ext'){"),
                     html.indexOf("} else if(currentModal==='cdaily'){"));
  // The contractor now picks the period, so the deadline follows their choice
  // rather than the day the file happened to arrive — which was wrong for
  // anybody billing late.
  ok(/'Due Date':payUploadDue\(_period\)/.test(u),
     'an upload records the deadline rather than a blank, so the log column is right from the start');
  const f=html.slice(html.indexOf('function payUploadDue(period)'));
  ok(/billingDatesFor\(base\)/.test(f.slice(0,400)), 'from the billing cycle');
  ok(/\(period && parseLocalDate\(period\)\) \|\| new Date\(\)/.test(f.slice(0,400)),
     'for the period chosen, falling back to today only when none was');
  // Sliced from the function rather than a fixed number of characters: the
  // body grew when the period was added and a 300-character window stopped
  // reaching the end of it.
  const body=f.slice(0, f.indexOf('\n}')+2);
  ok(/catch\(e\)\{ return ''; \}/.test(body),
     'and a project with no cycle configured records nothing rather than failing the upload');
}

console.log('Change orders are still left alone, as asked');
{
  const r=html.slice(html.indexOf('function renderAttention'), html.indexOf('// ── ARCHIVING COMPLETED'));
  ok(!/co.*payDueDate/.test(r), 'no borrowed deadline reaches a change order');
  const co=P.run(`(function(){ const steps=[]; return typeof payDueDate==='function'; })()`);
  ok(co===true, 'the helper is only used where a due date column exists');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-paydue.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
