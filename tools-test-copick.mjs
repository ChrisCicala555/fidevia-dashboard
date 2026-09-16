// "Maybe even for approved change orders, we have a selector to pick from the
// approved COs on the dashboard."
//
// The field was a number somebody added up off the G702. The dashboard holds
// the change orders it is the sum of. Asking which ones the application claims
// gives more than a total: when the figures disagree, a list can say which
// change order is missing, and a total never can.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
const CO=(o)=>Object.assign({'PCO #':'','CO #':'CO-GC-001','Company':'Summit Builders',
  'Description':'Added footings','Status':'Approved','Approved Amount':'5000',
  'Date Approved':'2026-08-10','Allowance Splits':'','Rolled Into':''}, o);
P.run(`allData.co=${JSON.stringify([
  CO(),
  CO({'CO #':'CO-GC-002','Description':'Door hardware','Approved Amount':'3000','Date Approved':'2026-08-20'}),
  CO({'CO #':'CO-GC-003','Description':'Deduct: omitted canopy','Approved Amount':'-1000','Date Approved':'2026-09-02'}),
  CO({'CO #':'CO-GC-004','Description':'Later work','Approved Amount':'9000','Date Approved':'2026-11-01'}),
  CO({'CO #':'','PCO #':'PCO-GC-009','Description':'Still a proposal','Approved Amount':'4000'}),
  CO({'CO #':'CO-MEP-001','Company':'Delaney Mechanical','Approved Amount':'2000'})
])};`);
const fields=(vals)=>P.run(`['f-contr','f-period','f-cos-approved','f-co-pick'].forEach(function(id){
    var el=document.createElement(id==='f-co-pick'?'div':'input'); el.id=id; document.body.appendChild(el);
    document.getElementById=(function(p){ return function(x){ return x===id?el:p(x); }; })(document.getElementById);
  });
  document.getElementById('f-contr').value=${JSON.stringify(vals.co)};
  document.getElementById('f-period').value=${JSON.stringify(vals.period)};
  coPickReset();`);

console.log('The list is the thing the total is a sum of');
{
  const list=P.run(`coClaimList('Summit Builders','2026-09-01')`);
  ok(list.length===3, 'the executed change orders on this contract as at the period');
  ok(list.map(c=>c.num).join()==='CO-GC-001,CO-GC-002,CO-GC-003', 'in the order they were executed');
  ok(!list.some(c=>c.num==='CO-GC-004'), 'nothing executed after the period');
  ok(!list.some(c=>!c.num), 'no proposal that never became a change order');
  ok(!list.some(c=>/MEP/.test(c.num)), "and nothing from another company's contract");
  ok(list[0].desc==='Added footings' && list[0].amount===5000, 'each carries what it is and what it is worth');
  ok(list[2].amount===-1000, 'a deduct keeps its sign');
  ok(P.run(`coNetAsOf('Summit Builders','2026-09-01')`)===7000,
     'and the total is exactly that list added up, so the two cannot disagree');
  ok(/function coNetAsOf\(name, asOf\)\{\s*\n\s*return coClaimList\(name, asOf\)\.reduce/.test(html),
     'because the total is defined as the sum of the list');
}

console.log('Choosing');
{
  fields({co:'Summit Builders', period:'2026-09-01'});
  P.run(`coPickRender();`);
  const fld=()=>P.run(`document.getElementById('f-cos-approved').value`);
  const box=()=>String(P.run(`document.getElementById('f-co-pick').innerHTML`));
  ok(fld()==='7,000', 'every executed change order is claimed to begin with, and totalled');
  ok(/CO-GC-001/.test(box()) && /Added footings/.test(box()),
     'each one named and described, so it can be recognised without opening it');
  ok((box().match(/type="checkbox"/g)||[]).length===3, 'one box each');
  ok(!/checkbox[^>]*data-num="CO-GC-004"/.test(box()), 'and nothing from outside the period');
  ok(/All 3 executed change orders, \$7,000\./.test(box().replace(/<[^>]+>/g,'')), 'saying so in words');

  P.run(`coPickToggle('CO-GC-002');`);
  ok(fld()==='4,000', 'unticking one takes it out of the total');
  ok(/2 of 3 — \$4,000\. The rest are executed but not claimed here\./
     .test(box().replace(/<[^>]+>/g,'')), 'and says how many are left out');
  ok(P.run(`coPickChosen().map(function(c){return c.num;}).join()`)==='CO-GC-001,CO-GC-003',
     'the chosen set is the ones still ticked');

  P.run(`coPickAll(false);`);
  ok(fld()==='0' || fld()==='', 'clearing all claims nothing');
  P.run(`coPickAll(true);`);
  ok(fld()==='7,000', 'and selecting all puts them back');
  ok(P.run(`coPickTotal()`)===7000, 'the total agrees');
}

console.log('Starting clean, and following the contractor');
{
  P.run(`CO_PICK.off=new Set(['CO-GC-001']); CO_PICK.manual=true; coPickReset();`);
  ok(P.run(`CO_PICK.off.size`)===0 && P.run(`CO_PICK.manual`)===false,
     'a fresh application claims everything and picks from the log');
  ok(/const CO_PICK=\{ off:new Set\(\), manual:false \};/.test(html),
     'which is also where it starts');
  // Which change orders are on offer depends on both, so neither may move
  // without the list moving with it.
  ok(/ci\.onchange=function\(\)\{ renum\(\); coPickReset\(\); coPickRender\(\); \};/.test(html),
     'changing the contractor redraws the list from that contract');
  ok(/ci\.oninput=function\(\)\{[^\n]*coPickReset\(\); coPickRender\(\); \};/.test(html),
     'as does typing one in');
  ok(/if\(pf\) pf\.onchange=function\(\)\{ coPickReset\(\); coPickRender\(\); \};/.test(html),
     'and so does changing the period, since it decides which are executed yet');
  ok(/coPickReset\(\); try\{ coPickRender\(\); \}catch\(e\)\{\}/.test(html),
     'and the form draws it on opening, without a thrown lookup stopping the form');
  fields({co:'Summit Builders', period:'2026-09-01'});
  P.run(`coPickRender();`);
}

console.log('The field itself is not typed into');
{
  ok(/id="f-cos-approved"[^>]*readonly[^>]*class="fig-locked"/.test(html),
     'it shows the total the list adds up to');
  ok(/id="f-co-pick"/.test(html), 'with the list beneath it');
  const box=()=>String(P.run(`document.getElementById('f-co-pick').innerHTML`));
  P.run(`coPickManual(true);`);
  ok(!P.run(`!!document.getElementById('f-cos-approved').getAttribute('readonly')`),
     'unless somebody says the figure is not on the dashboard, and then it opens');
  ok(/Entering the figure by hand\./.test(box().replace(/<[^>]+>/g,'')), 'saying which it is');
  ok(/Pick from the change order log instead/.test(box()), 'with a way back');
  P.run(`coPickManual(false); coPickRender();`);
  ok(P.run(`!!document.getElementById('f-cos-approved').getAttribute('readonly')`), 'and it closes again');
}

console.log('When there is nothing to pick');
{
  const box=()=>String(P.run(`document.getElementById('f-co-pick').innerHTML`));
  P.run(`document.getElementById('f-contr').value=''; coPickReset(); coPickRender();`);
  ok(/Choose a contractor to see their executed change orders\./.test(box().replace(/<[^>]+>/g,'')),
     'it asks for a contractor rather than showing an empty box');
  ok(P.run(`document.getElementById('f-cos-approved').value`)==='', 'and holds no total');
  P.run(`document.getElementById('f-contr').value='Delaney Mechanical';
         document.getElementById('f-period').value='2020-01-01'; coPickReset(); coPickRender();`);
  ok(/No executed change orders for Delaney Mechanical as at this period\./
     .test(box().replace(/<[^>]+>/g,'')), 'and says so by name when there are none');
  ok(/Enter a figure by hand/.test(box()), 'offering the hand-entered way out, which is when it is right');
}

console.log('What the application records');
{
  const sub=html.split("const _claimed = ")[1].split('\n')[0];
  ok(/CO_PICK\.manual \? '' :/.test(sub), 'a figure entered by hand claims nothing in particular');
  ok(/coPickChosen\(\)\.map\(c=>c\.num\)\.filter\(Boolean\)\.join\('; '\)/.test(sub),
     'otherwise the numbers of the ones ticked');
  ok(/'Change Orders Claimed':_claimed/.test(html), 'saved on the row');
  ok(/'Approved Change Orders','Change Orders Claimed','Previously Paid'/.test(html),
     'in a column of its own on the log');
}

console.log('And what the mismatch flag can say now');
{
  const row=(o)=>Object.assign({'Contractor':'Summit Builders','Period':'2026-09-01',
    'Approved Change Orders':'4000','Change Orders Claimed':'CO-GC-001; CO-GC-003'},o);
  const miss=P.run(`payUnclaimed(${JSON.stringify(row())})`);
  ok(miss.length===1 && miss[0].num==='CO-GC-002', 'it knows which one was left out');
  const t=String(P.run(`payCoCheckHTML(${JSON.stringify(row())})`)).replace(/<[^>]+>/g,'');
  ok(/Not claimed on this application: CO-GC-002 \(\+\$3,000\)\./.test(t),
     'and names it, with what it is worth, instead of describing the gap');
  ok(!/Either a change order has not been recorded/.test(t),
     'the guesswork wording gives way when there is no need to guess');
  const t2=String(P.run(`payCoCheckHTML(${JSON.stringify(row({'Change Orders Claimed':''}))})`)).replace(/<[^>]+>/g,'');
  ok(/Either a change order/.test(t2),
     'and stays for a row that never said what it claims — an older one, or a figure typed by hand');
  ok(P.run(`payUnclaimed(${JSON.stringify(row({'Change Orders Claimed':''}))})`).length===0,
     'where nothing is known to be missing, rather than everything');
  const t3=String(P.run(`payCoCheckHTML(${JSON.stringify(row({'Approved Change Orders':'7000'}))})`));
  ok(t3==='', 'and an application claiming everything says nothing at all');
}

console.log('The comma bug this field sat next to');
{
  ok(/const contract=payNum\(v\('f-contract'\)\), cosApp=payNum\(v\('f-cos-approved'\)\),/.test(html),
     'the money on this form is read with the parser that knows about commas');
  ok(!/parseFloat\(v\('f-contract'\)\)/.test(html),
     'not parseFloat, which read a million-dollar contract as one dollar');
  ok(P.run(`payNum('1,000,000')`)===1000000 && P.run(`parseFloat('1,000,000')`)===1,
     'which is the difference between the two');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-copick.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
