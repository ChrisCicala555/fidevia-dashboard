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

console.log('What it offers');
{
  const ch=P.run(`payPeriodChoices()`);
  ok(ch.length===7, 'a short run of months — got '+ch.length);
  ok(ch.every(x=>/^\d{4}-\d{2}-01$/.test(x)), 'each a first of month');
  ok(ch.indexOf(P.run(`payCurrentPeriod()`))===5, 'with the current one near the end, five back and one ahead');
  ok(ch[0]<ch[ch.length-1], 'in order');
  // A year boundary must not produce month 0 or 13.
  const months=ch.map(x=>Number(x.split('-')[1]));
  ok(months.every(m=>m>=1&&m<=12), 'and every month is a real month — got '+months.join(','));
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
  P.run(`document.getElementById('f-pa-period').value='2026-01-01'; payPeriodNote();`);
  const past=P.run(`document.getElementById('f-pa-period-note').textContent`);
  ok(/January 2026/.test(past), 'it names the period');
  ok(/was due/.test(past), 'and its formal date');
  ok(/late/.test(past), 'and says so when the application already is — at the moment of filing, not in a chase');
  P.run(`document.getElementById('f-pa-period').value=payCurrentPeriod(); payPeriodNote();`);
  const now=P.run(`document.getElementById('f-pa-period-note').textContent`);
  ok(!/late/.test(now) || new Date().getDate()>25, 'and does not cry late about the current period before its date');
}
{
  const noCfg=P.run(`(function(){ const b=currentProject.config.billing; currentProject.config.billing=null;
    document.getElementById('f-pa-period').value='2026-09-01'; payPeriodNote();
    const t=document.getElementById('f-pa-period-note').textContent;
    currentProject.config.billing=b; return t; })()`);
  ok(/month this application covers/.test(noCfg),
     'with no billing cycle set it explains the field rather than inventing a deadline');
  ok(!/due/.test(noCfg), 'and promises nothing');
}

console.log('It is on the form and recorded on the row');
{
  const f=html.slice(html.indexOf("payapp_ext:{title:'Upload Payment Application'"), html.indexOf("cdaily:{title:"));
  ok(/id="f-pa-period"/.test(f), 'the upload form asks for the period');
  ok(/Billing Period \*/.test(f), 'as a required field');
  ok(/<select/.test(f) && !/type="date"/.test(f),
     'as a choice of months rather than a date field, since an application belongs to a month');
  ok(/id="f-pa-period-note"/.test(f), 'with the deadline note beside it');
}
ok(/try\{ payFillPeriods\(\); \}catch\(e\)\{\}/.test(html), 'and it is filled each time the form opens');
{
  // Filling the list is not the same as landing on the right entry.
  P.run(`document.getElementById('f-pa-period').value=''; payFillPeriods();`);
  ok(P.run(`document.getElementById('f-pa-period').value`)===P.run(`payCurrentPeriod()`),
     'and lands on the current period rather than the oldest month in the list');
  ok(P.run(`document.getElementById('f-pa-period').innerHTML`).indexOf('selected')>=0,
     'with that option marked selected in the markup, for a form read before any script runs');
}
{
  const u=html.slice(html.indexOf("} else if(currentModal==='payapp_ext'){"), html.indexOf("} else if(currentModal==='cdaily'){"));
  ok(/const _period = String\(\(document\.getElementById\('f-pa-period'\)\|\|\{\}\)\.value\|\|''\) \|\| payCurrentPeriod\(\);/.test(u),
     'the choice is read from the form, falling back to the current period rather than to blank');
  ok(/'Period':_period/.test(u), 'and written to the row');
  ok(/'Due Date':payUploadDue\(_period\)/.test(u), 'with the due date derived from it');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-payperiod.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
