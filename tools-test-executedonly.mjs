// Christopher had one change order for $5,000 and a revised contract $15,000
// above the original. The dashboard was counting every APPROVED row, which
// included two proposals nobody had written a change order for. Under AIA A201
// the contract sum changes by change order — a written instrument — so an
// agreed proposal is money coming, not money in.
//
// Separately: deleting a change order left the proposals it had absorbed
// pointing at a record that no longer existed. "Rolled into CO-GC-003" is not
// an approval, so they stopped counting entirely and the contract quietly lost
// agreed work that was never in dispute.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);
R(`currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'3000000',active:true,
    allowances:[{id:'A',name:'Materials',amount:'50000'}]}];`);
const SCREEN = `[
  {'PCO #':'PCO-GC-001','CO #':'','Company':'Summit Builders','Approved Amount':'10000','Status':'Approved'},
  {'PCO #':'PCO-GC-002','CO #':'','Company':'Summit Builders','Approved Amount':'5000','Status':'Approved'},
  {'PCO #':'','CO #':'CO-GC-003','Company':'Summit Builders','Approved Amount':'5000','Status':'Approved',
   'Allowance Splits':JSON.stringify([{id:'A',amount:5000}])}]`;

console.log('What counts as executed');
ok(R(`coIsExecuted({'CO #':'CO-GC-003','Status':'Approved'})`)===true, 'approved with a CO number');
ok(R(`coIsExecuted({'CO #':'','PCO #':'PCO-GC-001','Status':'Approved'})`)===false,
   'an approved proposal with no CO number is not a change order, however agreed');
ok(R(`coIsExecuted({'CO #':'CO-GC-003','Status':'Open'})`)===false, 'nor is a CO number on its own');
ok(R(`coIsPending({'CO #':'','PCO #':'P1','Status':'Approved'})`)===true, 'that proposal is pending');
ok(R(`coIsPending({'CO #':'CO-1','Status':'Approved'})`)===false, 'and an executed one is not');
ok(R(`coIsPending({'PCO #':'P2','Status':'Open'})`)===false, 'an unapproved proposal is neither');
ok(R(`coIsExecuted(null)`)===false && R(`coIsPending(null)`)===false, 'and nothing is not either');

console.log('Christopher’s screen, recomputed');
R(`allData.co=${SCREEN}`);
ok(R(`coContractImpactFor('Summit Builders')`)===0,
   'the one change order adds nothing to the contract — it is funded entirely from the allowance');
ok(R(`coPendingFor('Summit Builders')`)===15000,
   'and the two approved proposals are reported as pending, not folded into the contract');
ok(R(`fmtMoney(3000000+coContractImpactFor('Summit Builders'))`)==='$3,000,000',
   'so the revised contract is the original, which is what the paperwork says');

console.log('It moves when the change order is written');
R(`allData.co[0]['Status']='Rolled into CO-GC-003'; allData.co[0]['Rolled Into']='CO-GC-003';
   allData.co[1]['Status']='Rolled into CO-GC-003'; allData.co[1]['Rolled Into']='CO-GC-003';
   allData.co[2]['Approved Amount']='15000';`);
ok(R(`coContractImpactFor('Summit Builders')`)===10000,
   'covering both proposals moves 15,000 into the contract less the 5,000 allowance draw');
ok(R(`coPendingFor('Summit Builders')`)===0, 'and nothing is pending any more');

console.log('Deleting the change order puts the proposals back');
{
  R(`ROWS=allData.co.slice(); GONE=ROWS.pop(); BACK=coUnrollCovered(ROWS, GONE); allData.co=ROWS;`);
  ok(R(`JSON.stringify(BACK)`)==='["PCO-GC-001","PCO-GC-002"]', 'both are named as reopened');
  ok(R(`allData.co[0]['Status']`)==='Approved' && R(`allData.co[1]['Status']`)==='Approved',
     'and are agreed again rather than left pointing at a change order that is gone');
  ok(R(`allData.co[0]['Rolled Into']`)==='' , 'with the reference cleared');
  ok(R(`coPendingFor('Summit Builders')`)===15000,
     'so the work reappears as pending instead of vanishing from the figures');
  ok(R(`String(allData.co[0]['Approved Amount'])`)==='10000',
     'keeping the amount agreed at the time — the negotiation happened, only the paperwork has gone');
}
{
  // Only the ones it actually covered.
  R(`allData.co=[{'PCO #':'P1','Rolled Into':'CO-9','Status':'Rolled into CO-9','Company':'X'},
                 {'PCO #':'P2','Rolled Into':'CO-8','Status':'Rolled into CO-8','Company':'X'}];
     BACK=coUnrollCovered(allData.co, {'CO #':'CO-9'});`);
  ok(R(`JSON.stringify(BACK)`)==='["P1"]', 'a proposal rolled into a different change order is left alone');
  ok(R(`allData.co[1]['Status']`)==='Rolled into CO-8', 'and keeps its own reference');
}
{
  // The row that matters is one that was never covered at all: its Rolled Into
  // is blank, so a change order with a blank number would match it and reopen
  // every untouched proposal on the project.
  ok(R(`JSON.stringify(coUnrollCovered([{'PCO #':'P1','Rolled Into':''},{'PCO #':'P2'}], {'CO #':'','PCO #':''}))`)==='[]',
     'a change order with no number of its own claims nothing');
  ok(R(`(function(){const rs=[{'PCO #':'P1','Status':'Approved'}];
      coUnrollCovered(rs,{'CO #':''}); return rs[0]['Status'];})()`)==='Approved',
     'and leaves rows it did not cover exactly as they were');
}

console.log('Wired into the delete');
{
  const d = html.split('async function deleteRow(key,i,reason,alsoRevoke){')[1].split('\n}')[0];
  ok(/const _unrolled = key==='co' \? coUnrollCovered\(rows, removed\) : \[\]/.test(d),
     'change orders unroll; nothing else does');
  ok(d.indexOf('coUnrollCovered') < d.indexOf('await boxUploadText'),
     'before the log is written, so the reopened rows are saved with the deletion');
  ok(/reopened '\+_unrolled\.join\(', '\)/.test(d), 'the audit log names them');
  ok(/rows\.push\(\['Reopened'/.test(d), 'and so does the notification');
}

console.log('Pending is visible, not just excluded');
{
  const f = html.split('function renderFinancials')[1].split('\n}')[0];
  ok(/const pending = coPendingFor\(c\.name\)/.test(f), 'each contractor’s pending total is worked out');
  ok(/pending\?\('<div style="color:var\(--muted\);font-size:11px;"/.test(f),
     'and shown under their change order figure');
  ok(/tPending\+=pending/.test(f), 'summed across the project');
  ok(/approved, not yet in a change order/.test(f),
     'with the Revised Contract card saying what the figure beneath it is');
  ok(/They do not move the contract until one is/.test(f),
     'and why it is not in the contract');
}

console.log('Every money figure uses the same rule');
{
  ['allowanceReducedById','allowanceUsedById','allowanceUsedBy','coHasApproved','coContractImpactFor']
    .forEach(fn=>{
      const body = html.split('function '+fn)[1].split('\n}')[0];
      ok(/coIsExecuted\(r\)/.test(body), fn+' counts executed change orders');
      ok(!/coIsApproved\(r\)&&|coIsApproved\(r\)\n/.test(body), fn+' no longer counts proposals');
    });
}
ok(/const previous=mine\.filter\(x=>x!==r && coIsExecuted\(x\)/.test(html),
   'and the running total printed on the document itself agrees with the dashboard');

console.log((bad?'FAIL ':'ok   ')+'tools-test-executedonly.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
