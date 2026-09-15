// "This is like the third PCO-GC-001 we've had on the dashboard. Could that be
// creating the problem?"
//
// Yes, though not the one he was chasing. The next number was worked out from
// the rows currently on the log, so deleting PCO-GC-001 handed the number
// straight back. Two rows under one number is not cosmetic: rowIndexById
// refuses a duplicate rather than guess (which is what stopped a review
// stepping through), the item's folder in Box is named after the number so two
// records share one folder, and a change order saying it covers PCO-GC-001 no
// longer names one thing.
//
// A deleted number is now retired. Construction numbering does not go backwards.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

const boot=(cos, retired)=>{
  const P=bootPage(); P.run(SEED);
  P.run(`
    IS_ADMIN=true; EXTERNAL=false;
    currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'2000000',active:true},
                                       {name:'Delaney Mechanical',role:'MC',contract:'500000',active:true}];
    currentProject.config.retiredNumbers=${JSON.stringify(retired||{})};
    allData.co=${JSON.stringify(cos||[])};
    SAVED=null; writeProjectConfig=async(id,c)=>{ SAVED=JSON.parse(JSON.stringify(c)); };
  `);
  return P;
};
const R=(o)=>Object.assign({'PCO #':'','CO #':'','Company':'Summit Builders','Description':'',
  'Status':'Open','Cost Impact':'1000','Approved Amount':''}, o);

console.log('The number does not come back');
{
  // Proposals and change orders are separate registers now, so this exercises
  // the proposal one — the register these fixtures were always about.
  const P=boot([R({'PCO #':'PCO-GC-001'}),R({'PCO #':'PCO-GC-002'})]);
  ok(P.run(`nextItemNumber('co','Summit Builders','pco')`)==='PCO-GC-003', 'two on the log, next is 003');

  // Delete 002 the way the dashboard does: retire, then drop the row.
  ok(await P.run(`retireItemNumber('co', allData.co[1])`)===true, 'deleting it retires the number');
  P.run(`currentProject.config=SAVED; allData.co=[allData.co[0]];`);
  ok(P.run(`currentProject.config.retiredNumbers['pco:GC']`)===2, 'recorded against that trade run');
  ok(P.run(`nextItemNumber('co','Summit Builders','pco')`)==='PCO-GC-003',
     'and the next proposal is still 003, not the 002 just freed');

  // Delete the other one too. Nothing left on the log at all.
  await P.run(`retireItemNumber('co', allData.co[0])`);
  P.run(`currentProject.config=SAVED; allData.co=[];`);
  ok(P.run(`currentProject.config.retiredNumbers['pco:GC']`)===2,
     'retiring a lower number does not walk the mark backwards');
  ok(P.run(`nextItemNumber('co','Summit Builders','pco')`)==='PCO-GC-003',
     'an emptied log still does not reissue — which is the whole point');
}

console.log('Whose number it was');
{
  const P=boot([R({'PCO #':'PCO-MC-004','Company':'Delaney Mechanical'})]);
  await P.run(`retireItemNumber('co', allData.co[0])`);
  P.run(`currentProject.config=SAVED; allData.co=[];`);
  ok(P.run(`currentProject.config.retiredNumbers['pco:MC']`)===4, 'kept against the trade it belonged to');
  ok(P.run(`nextItemNumber('co','Delaney Mechanical','pco')`)==='PCO-MC-005', "so that trade's run continues");
  ok(P.run(`nextItemNumber('co','Summit Builders','pco')`)==='PCO-GC-001',
     'and another trade is untouched — its run never had a 004');
}
{
  // RFIs and change orders number separately, so retiring one must not move
  // the other.
  const P=boot([], {'co:GC':7});
  P.run(`allData.rfi=[];`);
  ok(P.run(`nextItemNumber('co','Summit Builders','co')`)==='CO-GC-008', 'the change order run picks up the mark');
  ok(P.run(`nextItemNumber('rfi','Summit Builders')`)==='RFI-GC-001', 'the RFI run does not');
}
{
  // Pay applications are the exception now: an owner reads App 1, 2, 3 as a
  // continuous run, and they are internal to one contract rather than issued
  // documents somebody outside has already seen. Deleting one frees its number,
  // and Box is checked before it is handed out again — covered in
  // tools-test-paynumfolder.mjs.
  const P=boot([]);
  P.run(`allData.pay_apps=[{'App #':'PA-003_Summit Builders','Contractor':'Summit Builders','Company':'Summit Builders'}];`);
  ok(await P.run(`retireItemNumber('pay_apps', allData.pay_apps[0])`)===false,
     'deleting a payment application retires nothing');
  ok(P.run(`SAVED`)===null, 'and writes no mark');
  ok(P.run(`nextItemNumber('pay_apps','Summit Builders')`)==='PA-004_Summit Builders',
     'while the log still drives the number for the ones that remain');
}

console.log('What is not a number');
{
  const P=boot([R({'PCO #':''}),R({'PCO #':'PCO-GC-002'})]);
  ok(await P.run(`retireItemNumber('co', allData.co[0])`)===false, 'a row with no number retires nothing');
  ok(P.run(`SAVED`)===null, 'and does not write the project for nothing');
  ok(await P.run(`retireItemNumber('daily', allData.co[1])`)===false, 'nor does a module that is not numbered');
  ok(await P.run(`retireItemNumber('co', null)`)===false, 'nor a row that is not there');
  ok(P.run(`SAVED`)===null, 'still no write');
  // Already at or above the mark: nothing to record.
  P.run(`currentProject.config.retiredNumbers={'pco:GC':5};`);
  ok(await P.run(`retireItemNumber('co', allData.co[1])`)===false, 'deleting below the mark changes nothing');
  ok(P.run(`SAVED`)===null, 'and writes nothing');
}
{
  // A failed save must not leave the page believing a number is retired when
  // the project on Box says otherwise.
  const P=boot([R({'PCO #':'PCO-GC-009'})]);
  P.run(`writeProjectConfig=async()=>{ throw new Error('Box said no'); };`);
  ok(await P.run(`retireItemNumber('co', allData.co[0])`)===false, 'a failed write reports failure');
  ok(P.run(`JSON.stringify(currentProject.config.retiredNumbers||{})`)==='{}',
     'and the mark is rolled back rather than held only in this tab');
}

console.log('Duplicates already on the log');
{
  const P=boot([R({'PCO #':'PCO-GC-001','Description':'first'}),
                R({'PCO #':'PCO-GC-001','Description':'second'}),
                R({'PCO #':'PCO-GC-002'})]);
  const d=P.run(`duplicateItemNumbers('co')`);
  ok(d.length===1 && d[0].count===2, 'the repeated number is found, once');
  ok(d[0].num==='pco-gc-001', 'and named');
  P.run(`renderCOs()`);
  const f=P.run(`document.getElementById('changeorder-count').innerHTML`);
  ok(/2 records share PCO-GC-001/.test(f), 'and said on the log, beside the count');
  ok(/var\(--danger\)/.test(f), 'in red, because a review will not advance through it');

  P.run(`allData.co=[allData.co[0],allData.co[2]]; renderCOs();`);
  ok(!/share/.test(P.run(`document.getElementById('changeorder-count').innerHTML`)),
     'and the warning goes when the duplicate does');
  ok(/Showing 1 to 2 of 2 change orders/.test(P.run(`document.getElementById('changeorder-count').innerHTML`)),
     'leaving the ordinary count behind');
}
{
  // An unnumbered row is not a duplicate of another unnumbered row.
  const P=boot([R({'PCO #':''}),R({'PCO #':''})]);
  ok(P.run(`duplicateItemNumbers('co').length`)===0, 'two rows with no number yet are not flagged');
}

console.log('Wiring');
{
  const d=html.slice(html.indexOf('async function deleteRow('));
  const body=d.slice(0, d.indexOf('\nasync function ', 10));
  ok(/retireItemNumber\(key, removed\)/.test(body), 'deleting a record retires its number');
  ok(body.indexOf('retireItemNumber(key, removed)') < body.indexOf('rows.splice(i,1)'),
     'before the row leaves the log, since the row is where the number lives');
  ok(/try\{ _retiredNum=await retireItemNumber/.test(body),
     'and a failure there does not stop the delete — one reused number beats a record that will not go');
}
ok(/const gone=retiredHigh\(key, comp, run\); if\(gone>max\) max=gone;/.test(html),
   'and the next number takes the retired mark into account');
ok(/const gone=retiredHigh\('pay_apps', comp\); if\(gone>max\) max=gone;/.test(html),
   'on the per-contractor run too');

console.log((bad?'FAIL':'ok  ')+' tools-test-retirenum.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
