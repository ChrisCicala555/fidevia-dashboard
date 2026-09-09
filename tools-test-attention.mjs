// One item, one line in Needs Your Attention.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const lines = () => (b.run("document.getElementById('attention-panel').innerHTML")
  .match(/<div class="att-item"[\s\S]*?<\/div>/g)||[])
  .map(x=>x.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
const asArchitect = () => b.run(`
  EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='a@x.test'; ME_NAME='Test Architect';
  currentProject.userCompany='Architect 2'; currentProject.userRole='architect'; DATA_READY=true;`);

// The screenshot: the workflow step is with our firm, and the item is also
// assigned to our firm. Two rules, one submittal.
asArchitect();
b.run(`allData.rfi=[]; allData.sub=[Object.assign({}, allData.sub[0], {
  'Submittal #':'SUB-GC-001','Description':'Huge Construction','Reviewer':'Architect 2',
  'Status':'Pending Review','Workflow Step':'0','Workflow Status':'In Review'})];`);
b.run("renderAll()");
{
  const l = lines();
  ok(l.length===1, 'a submittal that qualifies twice is listed once ('+l.length+')');
  ok(/SUB-GC-001/.test(l[0]||''), 'and it is the right item');
  ok(/Your review/.test(l[0]||''),
     'keeping the badge that says most about who is holding it, not the vaguer one');
  ok(!/Assigned to/.test(l.join(' ')), 'the second, looser reason is dropped');
}
// The count in the header follows the deduplicated list.
ok(/>1</.test(b.run("document.getElementById('attention-panel').innerHTML")),
   'and the count says one thing to do, not two');

// Overdue is the exception: it is more urgent than who has it, so it wins.
b.run(`allData.sub=[]; allData.rfi=[Object.assign({}, allData.rfi[0], {
  'RFI #':'RFI-GC-009','Subject':'Late one','Assigned To':'Architect 2',
  'Status':'Open','Due Date':'2026-08-01','Workflow Step':'0','Workflow Status':'In Review'})];`);
b.run("renderAll()");
{
  const l = lines();
  ok(l.length===1, 'an item both with us and overdue is still one line');
  ok(/Overdue/.test(l[0]||''), 'and it says overdue, which is the more urgent fact');
}

// Nothing outstanding still reads as nothing outstanding.
b.run("allData.rfi=[]; allData.sub=[]; allData.co=[]; allData.pay_apps=[];");
b.run("renderAll()");
ok(lines().length===0, 'with nothing outstanding there are no lines');

// The rule itself.
{
  const c = html.split('const byItem=new Map();')[1].split('el.style.display')[0];
  ok(/String\(i\.label\|\|i\.badge\|\|''\)/.test(c),
     'the key is the item, not the item plus the reason it was listed');
  ok(/if\(i\.cls==='' && prev\.cls!==''\)/.test(c), 'an overdue duplicate upgrades the line already there');
  ok(!/i\.label\+i\.badge/.test(html), 'and the old key is gone');
}

console.log((bad?'FAIL':'ok  '),' tools-test-attention.mjs —',n,'assertions');
process.exit(bad?1:0);
