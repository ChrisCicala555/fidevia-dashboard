// "I also feel like we need a clearer way to understand which PCOs turned into
// COs."
//
// A proposal is priced (PCO), agreed, then papered as a change order with a CO
// number. The log showed all three as one list, so "Approved" covered both the
// ones that had become change orders and the ones still waiting to be written —
// and only the second kind is still somebody's job.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
const stage=(o)=>P.run(`coStage(${JSON.stringify(o)})`);

console.log('The three things a row can be, and the one it can stop being');
{
  ok(stage({'PCO #':'PCO-GC-001','Status':'Open'})==='open', 'priced and asked for, nothing agreed');
  ok(stage({'PCO #':'PCO-GC-001','Status':'Submitted'})==='open', 'under review is still open');
  ok(stage({'PCO #':'PCO-GC-001','Status':'Approved'})==='agreed',
     'agreed, but no CO number — the paper has not been written');
  ok(stage({'PCO #':'PCO-GC-001','CO #':'CO-001','Status':'Approved'})==='executed',
     'and with a CO number it has become a change order, which is the question being asked');
  ok(stage({'PCO #':'PCO-GC-001','CO #':'CO-001','Status':'Executed'})==='executed', 'however it is worded');
  ok(stage({'PCO #':'PCO-GC-001','Status':'Rejected'})==='closed', 'a refused proposal is not open work');
  ok(stage({'PCO #':'PCO-GC-001','Status':'Void'})==='closed', 'nor a void one');
  ok(stage({'PCO #':'PCO-GC-001','Status':'Withdrawn'})==='closed', 'nor one withdrawn');
  ok(stage({'PCO #':'PCO-GC-001','CO #':'CO-001','Status':'Rejected'})==='closed',
     'and a CO number does not outrank a decision against it — the stage follows the decision');
}

console.log('Said on the row, not only in the filter');
{
  const note=(o)=>P.run(`coStageNote(${JSON.stringify(o)})`);
  ok(/no CO number yet/.test(note({'Status':'Approved'})),
     'an agreed proposal says on its own row that nobody has written the change order');
  ok(/#8a5a00/.test(note({'Status':'Approved'})), 'in the amber the app uses for "this is waiting on you"');
  ok(note({'CO #':'CO-001','Status':'Approved'})==='',
     'an executed one says nothing extra — the arrow to its CO number already says it');
  ok(note({'Status':'Open'})==='', 'and an open one has nothing to wait for yet');
  ok(/'<strong>'\+esc\(r\['CO #'\]\)\+'<\/strong>'/.test(html),
     'which is what that arrow is: the PCO, then the CO number it became');
}

console.log('Counting them, with a way into each');
{
  const chips=(rows)=>P.run(`(function(){ coStageChips(${JSON.stringify(rows)});
    return document.getElementById('co-stage').innerHTML; })()`);
  const rows=[{'Status':'Open'},{'Status':'Submitted'},{'Status':'Approved'},
              {'CO #':'CO-001','Status':'Approved'},{'CO #':'CO-002','Status':'Executed'},
              {'Status':'Rejected'}];
  const h=chips(rows);
  ok(/All <span[^>]*>6</.test(h), 'every row is counted once');
  ok(/Open <span[^>]*>2</.test(h), 'two still open');
  ok(/Approved, no CO yet <span[^>]*>1</.test(h), 'one agreed and unwritten, which is the number worth seeing');
  ok(/Executed COs <span[^>]*>2</.test(h), 'two that became change orders');
  ok(/Closed <span[^>]*>1</.test(h), 'and one that never will');
  ok(/setCoStage\('executed'\)/.test(h), 'each count is a way into that stage');

  // A stage nobody is in is not a filter, it is a dead end.
  const none=chips([{'Status':'Open'}]);
  ok(!/Executed COs/.test(none), 'a stage with nothing in it is not offered');
  ok(/All <span[^>]*>1</.test(none), 'while All is always there');
  P.run(`CO_STAGE='executed'`);
  ok(/Executed COs <span[^>]*>0</.test(chips([{'Status':'Open'}])),
     'unless it is the one being looked at, which still needs its way out');
  P.run(`CO_STAGE=''`);
}

console.log('And the log follows the chip');
{
  const r=html.split('function renderCOs(){')[1].split('\n// ── Filtering the submittal log')[0];
  ok(/const shown=CO_STAGE \? live\.filter\(x=>coStage\(x\.r\)===CO_STAGE\) : live;/.test(r),
     'the rows shown are the ones at that stage');
  ok(/tb\.innerHTML=shown\.map/.test(r), 'and it is those that are drawn');
  ok(/countFooter\(shown\.length, all\.length/.test(r),
     'with the count under the table saying how many are on screen, not how many exist');
  ok(/coStageChips\(live\.map\(x=>x\.r\)\);/.test(r) &&
     r.indexOf('coStageChips') < r.indexOf('if(!live.length)'),
     'the chips are built before the empty-log return, so an empty log still has its counts');
  ok(/No change orders at this /.test(r) && /setCoStage\(\\?'\\?'\);return false;">Show all<\/a>/.test(r),
     'a filter that empties the table carries its own way out \u2014 otherwise the log looks broken '
     +'and the chip that did it is the one thing nobody suspects');
  ok(r.indexOf('if(!shown.length)') < r.indexOf('tb.innerHTML=shown.map'),
     'checked before the rows are drawn rather than after');
}

console.log(bad ? `FAIL tools-test-costage.mjs — ${bad} of ${n}` : `ok   tools-test-costage.mjs — ${n} assertions`);
process.exit(bad?1:0);
