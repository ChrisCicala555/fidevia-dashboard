// "In the Needs Your Attention tab of the home page, can we also add a Due
// Date to this?"
//
// Everything on that panel is something somebody has to do, and the list gave
// no way to tell what is due tomorrow from what is due in a month. Its order is
// about how each item qualified, not about urgency, so the date has to be on
// the line rather than implied by its position.
//
// Christopher's screenshot also showed three lines opening with a bare dash:
// the change orders. Their number lives in PCO # until they are executed, and
// this panel was reading CO # alone.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

const P=bootPage(); P.run(SEED);
const iso=(days)=>{ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };
const due=(v)=>P.run('attDueHTML('+JSON.stringify(v)+')');
const txt=(h)=>String(h).replace(/<[^>]+>/g,'').trim();

console.log('How a date reads');
ok(txt(due(iso(0)))==='Due today', 'today says so rather than "in 0 days"');
ok(txt(due(iso(1)))==='Due tomorrow', 'and tomorrow');
ok(txt(due(iso(3)))==='Due in 3 days', 'a few days out counts down');
ok(txt(due(iso(7)))==='Due in 7 days', 'up to a week');
ok(/^Due /.test(txt(due(iso(30)))) && !/days/.test(txt(due(iso(30)))),
   'beyond that it gives the date, since counting to 30 helps nobody — got '+txt(due(iso(30))));
ok(txt(due(iso(-1)))==='1 day overdue', 'a day late is singular');
ok(txt(due(iso(-5)))==='5 days overdue', 'and says how far past, not just "overdue"');

console.log('How it is marked');
ok(/att-due late/.test(due(iso(-1))), 'overdue is marked late');
ok(/att-due soon/.test(due(iso(0))) && /att-due soon/.test(due(iso(6))), 'this week is marked soon');
ok(!/late|soon/.test(due(iso(30))), 'and something a month out is neither');
ok(/title="Due /.test(due(iso(3))), 'the exact date is on hover, so "in 3 days" is never the only answer');

console.log('When there is no date');
ok(due('')==='', 'a blank date renders nothing at all');
ok(due(null)==='', 'and so does a missing one');
ok(due(undefined)==='', 'or an absent one');
ok(due('   ')==='', 'or whitespace');
ok(due('not a date')==='', 'and so does something unparseable — no invented deadline');
// The above found a real fault underneath: new Date(null) is the epoch rather
// than NaN, so a null date parsed as 1 January 1970 and this panel offered to
// tell somebody it was twenty thousand days overdue. Every caller of
// parseLocalDate had it — isOverdue, the month folders, the schedule chase.
ok(P.run(`parseLocalDate(null)`)===null, 'a null date is no date, not the epoch');
ok(P.run(`parseLocalDate(undefined)`)===null, 'and so is an absent one');
ok(P.run(`parseLocalDate('')`)===null, 'as an empty string always was');
ok(P.run(`parseLocalDate('  ')`)===null, 'and whitespace');
ok(P.run(`parseLocalDate('2026-09-20').toISOString().slice(0,10)`)==='2026-09-20',
   'while a real date still parses, in local time');
ok(P.run(`parseLocalDate(new Date(2026,8,20)).getDate()`)===20, 'and so does a Date');
ok(P.run(`isOverdue({'Status':'Open','Due Date':null})`)===false,
   'so an item with no due date is no longer permanently overdue');

console.log('On the panel itself');
{
  P.run(`
    IS_ADMIN=false; EXTERNAL=true; DATA_READY=true;
    ME_EMAIL='dana@meridian.test'; ME_NAME='Dana Reyes';
    currentProject.userCompany='Meridian Architects'; currentProject.userRole='architect';
    currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'1',active:true}];
    currentProject.config.workflows={rfi:[{person:'Dana Reyes',role:'Architect'}],
                                     co:[{person:'Dana Reyes',role:'Architect'}]};
    allData.contacts=[{Name:'Dana Reyes',Company:'Meridian Architects',Email:'dana@meridian.test'}];
    allData.sub=[]; allData.pay_apps=[];
    allData.rfi=[{'RFI #':'RFI-GC-001','Subject':'Fix the freaking bugs','Company':'Summit Builders',
      'Status':'Open','Due Date':'${iso(2)}','Workflow Step':'0','Workflow Status':'In Review',
      'Workflow Done':'[]','Workflow Signed':'{}'}];
    allData.co=[{'PCO #':'PCO-GC-001','CO #':'','Description':'Rationale to build bigger building',
      'Company':'Summit Builders','Status':'Open','Workflow Step':'0','Workflow Status':'In Review',
      'Workflow Done':'[]','Workflow Signed':'{}'}];
    renderAll();
  `);
  const panel=P.run(`document.getElementById('attention-panel').innerHTML`);
  ok(/Due in 2 days/.test(panel), 'the RFI carries its due date onto the line');
  ok(/att-due/.test(panel), 'in the due slot rather than glued to the description');
  ok(/PCO-GC-001/.test(panel),
     'and the change order is named by its proposal number instead of opening with a dash');
  ok(!/>\s*—\s*Rationale/.test(panel), 'which is what the screenshot showed');
  // A change order has no due date and must not borrow one.
  const coLine=panel.split('att-item').find(x=>/Rationale/.test(x))||'';
  ok(!/att-due/.test(coLine), 'a change order shows no due date, since it has none');
}

console.log('Wiring');
ok((html.match(/due:r\['Due Date'\]\|\|''/g)||[]).length===5,
   'every rule that has a due date to give passes it — got '+(html.match(/due:r\['Due Date'\]\|\|''/g)||[]).length);
{
  const d=html.slice(html.indexOf('const byItem=new Map();'));
  ok(/if\(!prev\.due && i\.due\) prev\.due=i\.due;/.test(d.slice(0,600)),
     'and a line deduped against one that had no date still ends up with it');
}
ok(/<span class="att-what">/.test(html) && /\.att-due\{margin-left:auto/.test(html),
   'the date sits at the end of the line rather than in the text');
ok(/@media \(max-width:620px\)[^}]*\{ \.att-item\{flex-wrap:wrap;\}/.test(html),
   'and wraps onto its own line on a phone instead of squeezing the description');

console.log((bad?'FAIL':'ok  ')+' tools-test-attdue.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
