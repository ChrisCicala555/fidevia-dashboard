// "Should be period start, period end. Due date is determined already by an
// input to the dashboard."
//
// An application covers a stretch of work, not a day. The log has carried
// Period From and Period To since it was written and nothing ever filled them —
// one date went in and the other two columns stayed empty. And the due date
// follows from the billing cycle the project set, so asking for it invited a
// third answer to a question already decided.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
const rng=(o)=>P.run(`payPeriodRange(${JSON.stringify(o)})`);
const span=(o)=>P.run(`payPeriodSpan(${JSON.stringify(o)})`);

console.log('Two ends, and a month they belong to');
{
  const r=rng({'Period From':'2026-09-01','Period To':'2026-09-30','Period':'2026-09-01'});
  ok(r.from==='2026-09-01' && r.to==='2026-09-30', 'what was recorded is what is shown');
  const part=rng({'Period From':'2026-09-14','Period To':'2026-09-30'});
  ok(part.from==='2026-09-14', 'including a part month, which is what a first application usually is');
}
{
  // Every application filed before today has one date and two empty columns.
  const old=rng({'Period':'2026-09-01'});
  ok(old.from==='2026-09-01' && old.to==='2026-09-30',
     'an older row reads as the whole month it was filed for, rather than as blank');
  const mid=rng({'Period':'2026-09-14'});
  ok(mid.from==='2026-09-01' && mid.to==='2026-09-30',
     'and a date mid-month still means that month, since that is all it ever meant');
  ok(rng({}).from==='' && rng({}).to==='', 'a row with no period at all invents neither end');
  ok(rng({'Period From':'2026-09-01'}).to==='2026-09-30', 'one end given, the other follows the month');
  ok(rng({'Period To':'2026-09-30'}).from==='', 'and an end without a start is left alone rather than guessed backwards');
}

console.log('How it reads on the log');
{
  ok(span({'Period From':'2026-09-01','Period To':'2026-09-30'})==='01/09/2026 – 30/09/2026'
     || /–/.test(span({'Period From':'2026-09-01','Period To':'2026-09-30'})),
     'both ends, where they differ');
  ok(span({'Period From':'2026-09-14','Period To':'2026-09-14'})===P.run(`fmtDMY('2026-09-14')`),
     'one date where the application covers a single day, not the same date twice');
  ok(span({})==='', 'and nothing where there is nothing');
  ok(/<td>'\+esc\(payPeriodSpan\(r\)\)\+'<\/td>/.test(html), 'which is what the log column shows');
  ok(!/fmtDMY\(r\['Period'\]\|\|r\['Period To'\]\|\|''\)/.test(html),
     'rather than one end of it, chosen by whichever column happened to be filled');
}

console.log('The due date is shown, not asked for');
{
  ok(/id="pa-due"[^>]*readonly[^>]*class="fig-locked"/.test(html),
     'read-only, like the other figures the dashboard already holds');
  ok(/id="pa-due-note"/.test(html), 'with somewhere to say where it came from');
  const f=html.split('function payPeriodNotes(){')[1].split('\nfunction ordinalDay')[0];
  ok(/const val=payUploadDue\(from\);/.test(f), 'derived from the start of the period');
  ok(/if\(due\) due\.value=val;/.test(f), 'and written into the field');
  ok(/From the project\\u2019s billing cycle/.test(f) || /billing cycle/.test(f),
     'naming the setting it follows from');
  ok(/No billing cycle set for this project/.test(f),
     'and saying plainly when there is none, rather than showing a date nobody chose');
  ok(/color:#8a5a00/.test(f), 'which is marked, because it is something to go and fix');
  ok(/row\['Due Date'\]=payUploadDue\(row\['Period'\]\);/.test(html),
     'the saved date is the derived one, not whatever was in the box');
  ok(!/row\['Due Date'\]=g\('pa-due'\)/.test(html), 'which is what it used to be');
}
{
  P.run(`currentProject={name:'X',config:{billing:{pencilDay:20,formalDay:25}}};`);
  ok(P.run(`payUploadDue('2026-09-01')`)==='2026-09-25', 'so a September application is due on the 25th');
  ok(P.run(`ordinalDay(25)`)==='25th' && P.run(`ordinalDay(1)`)==='1st'
     && P.run(`ordinalDay(2)`)==='2nd' && P.run(`ordinalDay(3)`)==='3rd',
     'said as a day of the month a person would say');
  ok(P.run(`ordinalDay(11)`)==='11th' && P.run(`ordinalDay(12)`)==='12th' && P.run(`ordinalDay(13)`)==='13th',
     'including the three that break the pattern');
  ok(P.run(`ordinalDay(21)`)==='21st' && P.run(`ordinalDay(31)`)==='31st', 'and the ones that resume it');
  P.run(`currentProject={name:'X',config:{}};`);
  ok(P.run(`payUploadDue('2026-09-01')`)==='',
     'with no cycle set there is no date, rather than a default nobody agreed to');
}

console.log('A period that ends before it starts');
{
  P.run(`['pa-period','pa-period-to','pa-due'].forEach(function(id){
      var el=document.createElement('input'); el.id=id; document.body.appendChild(el);
      document.getElementById=(function(p){ return function(x){ return x===id?el:p(x); }; })(document.getElementById);
    });
    ['pa-period-note','pa-due-note'].forEach(function(id){
      var el=document.createElement('div'); el.id=id; document.body.appendChild(el);
      document.getElementById=(function(p){ return function(x){ return x===id?el:p(x); }; })(document.getElementById);
    });`);
  const set=(id,v)=>P.run(`document.getElementById('${id}').value=${JSON.stringify(v)};`);
  const note=()=>String(P.run(`document.getElementById('pa-period-note').textContent`));
  set('pa-period','2026-09-30'); set('pa-period-to','2026-09-01');
  P.run(`payPeriodNotes();`);
  ok(note()==='The period ends before it starts.', 'is said as it is entered');
  ok(P.run(`document.getElementById('pa-period-note').style.color`)==='#8a5a00', 'and marked');
  set('pa-period-to','2026-09-30'); P.run(`payPeriodNotes();`);
  ok(/covers/.test(note()) && !/ends before/.test(note()),
     'and the complaint goes away when it is put right, rather than sticking');
  ok(P.run(`document.getElementById('pa-period-note').style.color`)==='', 'mark included');
  set('pa-period',''); set('pa-period-to',''); P.run(`payPeriodNotes();`);
  ok(/The stretch of work this application covers\./.test(note()),
     'and with neither end yet it says what is being asked for');
  const sub=html.split('async function submitPayAction(){')[1].split('\nfunction updateContractBar')[0];
  ok(/parseLocalDate\(_pt\)<parseLocalDate\(_pf\)\)\s*\n\s*throw new Error\('The period ends before it starts\.'\)/.test(sub),
     'and refused on the way in, not only warned about');
}

console.log('What the row keeps');
{
  const sub=html.split('async function submitPayAction(){')[1].split('\nfunction updateContractBar')[0];
  ok(/row\['Period From'\]=_pf; row\['Period To'\]=_pt;/.test(sub), 'both ends are recorded');
  ok(/row\['Period'\]=_pf \|\| row\['Period'\] \|\| '';/.test(sub),
     'and Period stays the month the application belongs to, which every comparison keys on');
  // coNetAsOf and payPrevPaidFor both cut by month on Period. If that moved to
  // the end of the period the cut would land a month late on any application
  // that runs past a month end.
  ok(/coNetAsOf\(co, \(row&&row\['Period'\]\)\|\|''\)/.test(html), 'the change order check still reads it');
  ok(/payPrevPaidFor\(co, period, skipIdx\)/.test(html), 'and so does previously paid');
}
{
  const o=html.split('function openPayAction(idx){')[1].split('\nfunction payActionChanged')[0];
  ok(/const rg=payPeriodRange\(r\); set\('pa-period',rg\.from\); set\('pa-period-to',rg\.to\);/.test(o),
     'reopening an application fills both ends');
  ok(!/set\('pa-due',r\['Due Date'\]\)/.test(o), 'and no longer fills a date somebody could then edit');
  ok(/if\(pt\) pt\.onchange=payPeriodNotes;/.test(o), 'moving the end redraws what it says');
  ok(/pd\.onchange=function\(\)\{ payPeriodNotes\(\); payPrefillKnown\(\); payFigureNotes\(\); \}/.test(o),
     'and moving the start redraws the due date and everything else that hangs off the month');
}
ok(/<label>Period Start<\/label>/.test(html) && /<label>Period End<\/label>/.test(html),
   'and the two fields are called what they are');

console.log((bad?'FAIL':'ok  ')+' tools-test-payspan.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
