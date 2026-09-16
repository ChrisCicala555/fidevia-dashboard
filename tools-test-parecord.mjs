// "Wouldn't this be information that we input when starting a project? Why
// would Fidevia need to input this as part of the record and review step?"
//
// Three of the five figures on a G702 are already held: the contract from
// project settings, the change orders from the change order log, previously
// paid from what earlier applications drew. Keying them again is how one
// contract sum ends up written two different ways.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`currentProject={name:'X',config:{contractors:[
  {name:'Summit Builders',contract:'850000'},
  {name:'Delaney Mechanical',contract:'0'},
  {name:'Old Trades',contract:'100000',active:false}]}};`);

console.log('The contract comes from project settings');
{
  ok(P.run(`contractOnRecord('Summit Builders')`)===850000, 'by name');
  ok(P.run(`contractOnRecord('  summit builders ')`)===850000, 'however it was typed');
  ok(P.run(`contractOnRecord('Nobody')`)===0, 'and answers nothing for a contractor with no record');
  ok(P.run(`contractOnRecord('Old Trades')`)===100000,
     'a contractor made inactive still has a contract — earlier applications against it must still price');
}

console.log('Previously paid comes from earlier applications');
const PA=(o)=>Object.assign({'Contractor':'Summit Builders','Period':'2026-07-01',
  'Status':'Approved & Signed','Approved Amount':'40000','Requested Amount':'40000'},o);
const set=a=>P.run(`allData.pay_apps=${JSON.stringify(a)};`);
{
  set([PA({'Period':'2026-06-01','Approved Amount':'30000'}),
       PA({'Period':'2026-07-01','Approved Amount':'40000'}),
       PA({'Period':'2026-08-01','Approved Amount':'50000'})]);
  ok(P.run(`payPrevPaidFor('Summit Builders','2026-08-01',2)`)===70000,
     'everything approved before this period, and not this application itself');
  ok(P.run(`payPrevPaidFor('Summit Builders','2026-06-01',0)`)===0, 'the first application has nothing behind it');
  ok(P.run(`payPrevPaidFor('Summit Builders','',-1)`)===120000, 'with no period, everything approved counts');
}
{
  // Two applications in one month: a pencil copy and the formal one.
  set([PA({'Period':'2026-08-05','Approved Amount':'50000'}), PA({'Period':'2026-08-25'})]);
  ok(P.run(`payPrevPaidFor('Summit Builders','2026-08-25',1)`)===0,
     'an application in the same month is this billing period, not money already drawn');
}
{
  set([PA({'Period':'2026-06-01','Status':'Submitted','Approved Amount':''}),
       PA({'Period':'2026-06-01','Status':'Denied','Approved Amount':'0'})]);
  ok(P.run(`payPrevPaidFor('Summit Builders','2026-08-01',-1)`)===0,
     'an application still out for review, or denied, has not been paid');
}
{
  set([PA({'Period':'2026-06-01','Approved Amount':'','Requested Amount':'25000'})]);
  ok(P.run(`payPrevPaidFor('Summit Builders','2026-08-01',-1)`)===25000,
     'approved without the amount restated means the amount requested');
}
{
  set([PA({'Contractor':'Delaney Mechanical','Period':'2026-06-01'})]);
  ok(P.run(`payPrevPaidFor('Summit Builders','2026-08-01',-1)`)===0, "another contract's draws are not this one's");
  set([PA({'Contractor':'','Company':'Summit Builders','Period':'2026-06-01'})]);
  ok(P.run(`payPrevPaidFor('Summit Builders','2026-08-01',-1)`)===40000,
     'a row carrying the company rather than the contractor is still theirs');
  set([PA({'Period':'2026-06-01','Approved Amount':'30000'}), PA({'Period':'','Approved Amount':'50000'})]);
  ok(P.run(`payPrevPaidFor('Summit Builders','2026-08-01',-1)`)===80000,
     'an undated draw counts, so what is left to bill is never overstated');
  ok(P.run(`payPrevPaidFor('Summit Builders','2026-08-01',1)`)===30000,
     'unless it is the application being reviewed \u2014 no application is previously paid against itself');
  ok(P.run(`payPrevPaidFor('Summit Builders','',0)`)===50000,
     'and it is left out with no period to judge by either');
}

console.log('All three together');
{
  P.run(`allData.co=[{'CO #':'CO-GC-001','Company':'Summit Builders','Status':'Approved',
    'Approved Amount':'12000','Date Approved':'2026-07-10','Allowance Splits':'','Rolled Into':''}];`);
  set([PA({'Period':'2026-07-01','Approved Amount':'40000'})]);
  const k=P.run(`payKnownFigures('Summit Builders','2026-08-01',-1)`);
  ok(k.contract===850000 && k.cos===12000 && k.prev===40000, 'contract, change orders and previously paid');
  ok(P.run(`payKnownFigures('','2026-08-01',-1)`)===null,
     'with no contractor named there is nothing to look up');
}

console.log('Prefilled, and only where empty');
{
  P.run(`PAY_CTX={idx:-1};
    ['pa-contr','pa-period','pa-contract','pa-cos','pa-prev'].forEach(function(id){
      var el=document.createElement('input'); el.id=id; document.body.appendChild(el);
      document.getElementById=(function(p){ return function(x){ return x===id?el:p(x); }; })(document.getElementById);
    });`);
  const v=id=>P.run(`document.getElementById('${id}').value`);
  const put=(id,val)=>P.run(`document.getElementById('${id}').value=${JSON.stringify(val)};`);
  put('pa-contr','Summit Builders'); put('pa-period','2026-08-01');
  P.run(`payPrefillKnown();`);
  ok(v('pa-contract')==='850,000', 'the contract fills itself in, formatted as the field formats what is typed');
  ok(v('pa-cos')==='12,000', 'so do the change orders');
  ok(v('pa-prev')==='40,000', 'and previously paid');

  put('pa-contract','900,000');
  P.run(`payPrefillKnown();`);
  ok(v('pa-contract')==='900,000',
     "a figure already there is somebody's reading of the paper and is not overwritten");

  put('pa-cos',''); P.run(`allData.co=[{'CO #':'CO-GC-002','Company':'Summit Builders',
    'Status':'Approved','Approved Amount':'-5000','Date Approved':'2026-07-10',
    'Allowance Splits':'','Rolled Into':''}]; payPrefillKnown();`);
  ok(v('pa-cos')==='-5,000',
     'a net credit keeps its minus sign — stripping it would turn money owed back into money charged');
}
ok(/NEGATIVE_OK=\['f-cost','nc-amount','pa-cos','f-cos-approved'\]/.test(html),
   'which the money formatter has to allow on both change order fields');

console.log('What it says under each field');
{
  P.run(`['pa-contract-note','pa-prev-note','pa-cos-note'].forEach(function(id){
      var el=document.createElement('div'); el.id=id; document.body.appendChild(el);
      document.getElementById=(function(p){ return function(x){ return x===id?el:p(x); }; })(document.getElementById);
    });`);
  const txt=id=>String(P.run(`document.getElementById('${id}').innerHTML`)).replace(/<[^>]+>/g,'');
  const put=(id,val)=>P.run(`document.getElementById('${id}').value=${JSON.stringify(val)};`);
  put('pa-contract','850,000'); put('pa-prev','40,000'); put('pa-cos','-5,000');
  P.run(`payFigureNotes();`);
  ok(txt('pa-contract-note')==='From project settings.', 'a matching figure just names where it came from');
  ok(txt('pa-prev-note')==='Approved on earlier applications.', 'for each of them');
  ok(txt('pa-cos-note')==='', 'and the change order check stays quiet when it agrees');

  put('pa-contract','900,000'); P.run(`payFigureNotes();`);
  ok(/From project settings — it holds \$850,000\./.test(txt('pa-contract-note')),
     'a changed figure says what the record holds instead, so the gap is visible rather than silent');
  ok(/color:#8a5a00/.test(String(P.run(`document.getElementById('pa-contract-note').innerHTML`))),
     'and is marked, not buried in the same grey as the rest');

  put('pa-prev','10,000'); P.run(`payFigureNotes();`);
  ok(/Approved on earlier applications — it holds \$40,000\./.test(txt('pa-prev-note')), 'same for previously paid');

  put('pa-contr','Delaney Mechanical'); put('pa-contract','500,000'); P.run(`payFigureNotes();`);
  ok(/No contract amount recorded for this contractor in project settings/.test(txt('pa-contract-note')),
     'with nothing on record it asks for the contract to be set there rather than flagging what was typed');
  ok(/add it there and it will fill itself in each month/.test(txt('pa-contract-note')),
     'naming the one place that fixes it for good');

  put('pa-contr',''); P.run(`payFigureNotes();`);
  ok(txt('pa-contract-note')==='' && txt('pa-prev-note')==='',
     'and with no contractor chosen there is nothing to compare against, so it says nothing');
}

console.log('The dialog separates the two kinds of figure');
{
  const d=html.slice(html.indexOf('id="pa-details"'), html.indexOf('id="pa-action"'));
  ok(/Read off the contractor's application/.test(d), 'one heading for what has to be read off the paper');
  ok(/Already on record — check, don't retype/.test(d), 'another for what the dashboard already holds');
  ok(d.indexOf('id="pa-req"') < d.indexOf("Already on record"),
     'the request for the period sits with the figures that are genuinely new');
  ok(d.indexOf('id="pa-contract"') > d.indexOf("Already on record"),
     'and the contract sits below the line, with the derived ones');
  ok(/Change one only if the paper application in hand says otherwise/.test(d),
     'saying plainly when overriding is the right thing to do');
  ['pa-contract','pa-cos','pa-prev'].forEach(id=>{
    ok(new RegExp('id="'+id+'"[^>]*oninput="payFigureNotes\\(\\)"').test(d), id+' answers as it is edited');
    ok(new RegExp('id="'+id+'-note"').test(d), id+' has somewhere to answer');
  });
}
ok(/ci\.oninput=function\(\)\{ payPrefillKnown\(\); payFigureNotes\(\); \};/.test(html),
   'choosing the contractor pulls their figures through');
ok(/try\{ payPrefillKnown\(\); payFigureNotes\(\); \}catch\(e\)\{\}/.test(html),
   'and so does opening the dialog, without a thrown lookup stopping the review');

console.log((bad?'FAIL':'ok  ')+' tools-test-parecord.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
