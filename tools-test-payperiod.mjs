// "When a contractor uploads a payment application they should have to pick
// which period it applies to — and it should automatically select the period
// for the month they are currently submitting for."
//
// The contractor knows which month their application covers. The dashboard was
// asking Fidevia to work it out afterwards from the date it arrived, which is a
// guess and the wrong one every time somebody bills late: an application filed
// on 2 October for September read as October, and took the wrong due date with it.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`currentProject.config.billing={pencilDay:20,formalDay:25};`);
const iso=(y,m,d)=>y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
const today=new Date();

console.log('It opens on the month being billed');
{
  const cur=P.run(`payCurrentPeriod()`);
  ok(/^\d{4}-\d{2}-01$/.test(cur), 'a period is the first of a month, not a day — got '+cur);
  const m=cur.split('-').map(Number);
  const now=new Date(); now.setHours(0,0,0,0);
  const formalThis=new Date(now.getFullYear(), now.getMonth(), 25);
  const expect = now>formalThis ? now.getMonth()+2 : now.getMonth()+1;
  const wrapped = ((expect-1)%12)+1;
  ok(m[1]===wrapped, 'this month, or the next once this month’s formal date has passed — got '+cur);
}
{
  // The roll matches the billing bar's rule rather than inventing a second one.
  const bar=html.slice(html.indexOf('function renderBillingBar'), html.indexOf('function renderBillingBar')+700);
  ok(/now > d\.formal/.test(bar), 'the bar rolls past the formal date');
  const pc=html.slice(html.indexOf('function payCurrentPeriod'), html.indexOf('function payPeriodLabel'));
  ok(/now > d\.formal/.test(pc), 'and the period picker rolls on the same comparison');
}

console.log('Month and year, so no month is out of reach');
{
  // A fixed run of months around today is a bet that nobody needs one outside
  // it. Two controls make every month reachable.
  // Read off the markup rather than through .options: the harness's DOM stub
  // does not build an options collection, and the markup is what a browser
  // parses anyway.
  const opts=(id)=>[...String(P.run(`document.getElementById('`+id+`').innerHTML`))
    .matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(m=>({v:m[1], t:m[2]}));
  P.run(`currentProject.config.milestones=[]; payFillPeriods();`);
  const months=opts('f-pa-month');
  ok(months.length===12, 'twelve months, always — got '+months.length);
  ok(months.map(o=>o.v).join()==='1,2,3,4,5,6,7,8,9,10,11,12', 'numbered one to twelve');
  ok(months[0].t==='January' && months[11].t==='December', 'named, not numbered, on screen');
  const years=P.run(`payYearChoices()`);
  ok(years.length>=5, 'a span of years — got '+years.length);
  ok(years.indexOf(new Date().getFullYear())>=0, 'including this one');
  ok(years.every((y,i)=>i===0||y===years[i-1]+1), 'consecutive, with no gaps');
}
{
  // A long job must be able to record a period in its own final year.
  P.run(`currentProject.config.milestones=[{name:'Final Completion',contract:'2031-06-30'}];`);
  const years=P.run(`payYearChoices()`);
  ok(years.indexOf(2031)>=0, 'the milestones stretch the range to cover them — got '+years.join(','));
  ok(years.indexOf(2032)>=0, 'with a year either side');
  P.run(`currentProject.config.milestones=[]; payFillPeriods();`);
}
{
  // Whatever the milestones say, this year is always offered.
  P.run(`currentProject.config.milestones=[{name:'x',contract:'2019-01-01'}]; payFillPeriods();`);
  const ys=[...String(P.run(`document.getElementById('f-pa-year').innerHTML`))
    .matchAll(/<option value="(\d+)"/g)].map(m=>Number(m[1]));
  ok(ys.indexOf(new Date().getFullYear())>=0, 'even a project dated years ago still offers the current year');
  ok(ys.indexOf(2018)>=0, 'and reaches back to cover the milestone it was given');
  P.run(`currentProject.config.milestones=[]; payFillPeriods();`);
}

console.log('The two read as one value');
{
  P.run(`document.getElementById('f-pa-month').value='2';
         document.getElementById('f-pa-year').value=String(new Date().getFullYear());`);
  ok(P.run(`payPeriodValue()`)===new Date().getFullYear()+'-02-01',
     'month and year compose into the first of that month');
  P.run(`document.getElementById('f-pa-month').value='11';`);
  ok(/-11-01$/.test(P.run(`payPeriodValue()`)), 'a two-digit month is not zero-padded twice');
  P.run(`document.getElementById('f-pa-month').value='';`);
  ok(P.run(`payPeriodValue()`)==='', 'and an incomplete pair composes nothing rather than a broken date');
  // The select cannot offer these, but the function is the guard and should not
  // depend on its only caller being well behaved.
  P.run(`document.getElementById('f-pa-month').value='13';`);
  ok(P.run(`payPeriodValue()`)==='', 'a month past December composes nothing, not 2026-13-01');
  P.run(`document.getElementById('f-pa-month').value='0';`);
  ok(P.run(`payPeriodValue()`)==='', 'and nor does a zeroth month');
  P.run(`document.getElementById('f-pa-month').value='6';
         document.getElementById('f-pa-year').value='12';`);
  ok(P.run(`payPeriodValue()`)==='', 'nor a year that is plainly not one');
  P.run(`payFillPeriods();`);
}
{
  ok(P.run(`payPeriodLabel('2026-09-01')`)==='September 2026', 'labelled as a month and year');
  ok(P.run(`payPeriodLabel('')`)==='', 'and nothing labels as nothing');
  ok(P.run(`payPeriodLabel('rubbish')`)==='', 'as does nonsense');
}

console.log('The deadline follows the period, not the day it arrived');
{
  ok(P.run(`payUploadDue('2026-08-01')`)==='2026-08-25',
     'billing August gets August’s formal date even if filed later');
  ok(P.run(`payUploadDue('2026-12-01')`)==='2026-12-25', 'and December gets December’s');
  ok(P.run(`payUploadDue('')`)!=='', 'no period falls back rather than leaving it blank');
  const noCfg=P.run(`(function(){ const b=currentProject.config.billing; currentProject.config.billing=null;
    const x=payUploadDue('2026-08-01'); currentProject.config.billing=b; return x; })()`);
  ok(noCfg==='', 'and a project with no billing cycle set still promises no deadline');
}

console.log('The note says what the choice commits to');
{
  P.run(`document.getElementById('f-pa-month').value='1';
         document.getElementById('f-pa-year').value='2026'; payPeriodNote();`);
  const past=P.run(`document.getElementById('f-pa-period-note').textContent`);
  ok(/January 2026/.test(past), 'it names the period');
  ok(/was due/.test(past), 'and its formal date');
  ok(/late/.test(past), 'and says so when the application already is — at the moment of filing, not in a chase');
  P.run(`payFillPeriods();`);
  const now=P.run(`document.getElementById('f-pa-period-note').textContent`);
  ok(!/late/.test(now) || new Date().getDate()>25, 'and does not cry late about the current period before its date');
}
{
  const noCfg=P.run(`(function(){ const b=currentProject.config.billing; currentProject.config.billing=null;
    document.getElementById('f-pa-month').value='9';
    document.getElementById('f-pa-year').value='2026'; payPeriodNote();
    const t=document.getElementById('f-pa-period-note').textContent;
    currentProject.config.billing=b; return t; })()`);
  ok(/month this application covers/.test(noCfg),
     'with no billing cycle set it explains the field rather than inventing a deadline');
  ok(!/due/.test(noCfg), 'and promises nothing');
}

console.log('It is on the form and recorded on the row');
{
  const f=html.slice(html.indexOf("payapp_ext:{title:'Upload Payment Application'"), html.indexOf("cdaily:{title:"));
  ok(/id="f-pa-month"/.test(f) && /id="f-pa-year"/.test(f), 'the upload form asks for month and year');
  ok(/Billing Period \*/.test(f), 'as a required field');
  ok((f.match(/<select/g)||[]).length===2 && !/type="date"/.test(f),
     'as two choices rather than a date field, since an application belongs to a month and has no day');
  ok(/id="f-pa-period-note"/.test(f), 'with the deadline note beside it');
}
ok(/try\{ payFillPeriods\(\); \}catch\(e\)\{\}/.test(html), 'and it is filled each time the form opens');
{
  // Filling the lists is not the same as landing on the right entries.
  P.run(`document.getElementById('f-pa-month').value='1';
         document.getElementById('f-pa-year').value='2024'; payFillPeriods();`);
  ok(P.run(`payPeriodValue()`)===P.run(`payCurrentPeriod()`),
     'and lands on the current period rather than the first entry in either list');
  ok(P.run(`document.getElementById('f-pa-month').innerHTML`).indexOf('selected')>=0,
     'with the month marked selected in the markup, for a form read before any script runs');
  ok(P.run(`document.getElementById('f-pa-year').innerHTML`).indexOf('selected')>=0, 'and the year');
}
{
  const u=html.slice(html.indexOf("} else if(currentModal==='payapp_ext'){"), html.indexOf("} else if(currentModal==='cdaily'){"));
  ok(/const _period = payPeriodValue\(\) \|\| payCurrentPeriod\(\);/.test(u),
     'the choice is read from the form, falling back to the current period rather than to blank');
  ok(/'Period':_period/.test(u), 'and written to the row');
  ok(/'Due Date':payUploadDue\(_period\)/.test(u), 'with the due date derived from it');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-payperiod.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
