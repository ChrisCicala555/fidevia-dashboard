// "If I delete an approved/signed change order, what happens to the contract
// amount and the allowances?"
//
// Answering that turned up a bug in the third thing it affects: the proposals
// the change order covered. Rolling one in closes its review chain with a
// decision of 'rolled', which the workflow reads as decided-against. Releasing
// it again cleared 'Rolled Into' and set the status back to Approved, but left
// the chain stopped — so no other change order could cover it (coRollEligible
// refuses a stopped row) and coSettled counted it as finished and offered it
// for archiving. The delete prompt promised it would be picked up by another
// change order, and nothing could.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

const boot=()=>{
  const P=bootPage(); P.run(SEED);
  P.run(`
    IS_ADMIN=true; EXTERNAL=false; ME_NAME='Christopher Cicala';
    currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'2000000',active:true,
      allowances:[{id:'A',name:'Floor leveler',amount:'60000'}]}];
    currentProject.config.workflows={co:[{person:'Dana Reyes',role:'Architect'}]};
    allData.contacts=[{Name:'Dana Reyes',Company:'Meridian Architects',Email:'d@m.test'}];
    allData.co=[
      {'PCO #':'PCO-GC-001','CO #':'CO-GC-001','Company':'Summit Builders','Status':'Approved',
       'Approved Amount':'50000','Allowance Splits':${JSON.stringify(JSON.stringify([{id:'A',amount:50000}]))},'Rolled Into':''},
      {'PCO #':'PCO-GC-003','CO #':'','Company':'Summit Builders','Status':'Rolled into CO-GC-001',
       'Approved Amount':'8000','Rolled Into':'CO-GC-001','Workflow Status':'Rejected',
       'Workflow Done':'[]','Workflow Signed':'{}','Workflow Step':'0'}];
  `);
  return P;
};

console.log('The money reverses, because it was never stored');
{
  const P=boot();
  ok(P.run(`allowanceUsedById('Summit Builders','A')`)===50000, 'the allowance is drawn while the CO exists');
  P.run(`allData.co=allData.co.filter(r=>r['CO #']!=='CO-GC-001');`);
  ok(P.run(`allowanceUsedById('Summit Builders','A')`)===0, 'and undrawn the moment the row goes');
  ok(P.run(`allowancesFor('Summit Builders')[0].amount`)===60000, 'the allowance is back at its full value');
}
{
  // A deduct that wrote an allowance down releases it again too.
  const P=boot();
  P.run(`allData.co.push({'PCO #':'PCO-GC-009','CO #':'CO-GC-009','Company':'Summit Builders',
    'Status':'Approved','Approved Amount':'-10000','Rolled Into':'',
    'Allowance Splits':${JSON.stringify(JSON.stringify([{id:'A',amount:10000}]))}});`);
  ok(P.run(`allowancesFor('Summit Builders')[0].amount`)===50000, 'a deduct writes the allowance down');
  ok(P.run(`contractBaseFor('Summit Builders')+coContractImpactFor('Summit Builders')`)===1990000,
     'and takes it off the contract');
  P.run(`allData.co=allData.co.filter(r=>r['CO #']!=='CO-GC-009');`);
  ok(P.run(`allowancesFor('Summit Builders')[0].amount`)===60000, 'deleting it restores the allowance');
  ok(P.run(`contractBaseFor('Summit Builders')+coContractImpactFor('Summit Builders')`)===2000000,
     'and the contract');
}

console.log('The proposals it covered come back properly');
{
  const P=boot();
  const covered=()=>P.run(`allData.co.find(r=>r['PCO #']==='PCO-GC-003')`);
  ok(covered()['Rolled Into']==='CO-GC-001', 'it starts covered');
  ok(P.run(`wfIsStopped(allData.co[1])`)===true, 'with its chain closed by the roll-in');
  ok(P.run(`coRollEligible(allData.co[1])`)===false, 'so nothing else can cover it');

  const back=P.run(`coUnrollCovered(allData.co, allData.co[0])`);
  ok(back.join()==='PCO-GC-003', 'deleting the change order releases it');
  ok(covered()['Rolled Into']==='', 'the cover is cleared');
  ok(covered()['Status']==='Approved', 'and it reads as agreed again — the negotiation still happened');
  ok(P.run(`wfIsStopped(allData.co[1])`)===false, 'its review chain reopens, which is the fix');
  ok(P.run(`coRollEligible(allData.co[1])`)===true,
     'so another change order really can pick it up, as the delete prompt promises');
  ok(P.run(`coSettled(allData.co[1])`)===false,
     'and it is not counted as settled, so the archive does not offer to file it away');
  ok(P.run(`coPendingFor('Summit Builders')`)===8000,
     'it shows as agreed and not yet in a change order');
}
{
  // Reopening goes back to the step it was parked on, not to the start.
  const P=boot();
  P.run(`allData.co[1]['Workflow Step']='0';`);
  P.run(`coUnrollCovered(allData.co, allData.co[0]);`);
  ok(String(P.run(`allData.co[1]['Workflow Status']`)).toLowerCase()!=='rejected',
     'the chain is no longer marked against it');
}

console.log('What it must not touch');
{
  const P=boot();
  P.run(`allData.co.push({'PCO #':'PCO-GC-005','CO #':'','Company':'Summit Builders','Status':'Open',
    'Rolled Into':'','Workflow Status':'In Review','Workflow Done':'[]','Workflow Step':'0'});`);
  const before=P.run(`JSON.stringify(allData.co[2])`);
  P.run(`coUnrollCovered(allData.co, allData.co[0]);`);
  ok(P.run(`JSON.stringify(allData.co[2])`)===before,
     'a proposal that was never covered by this change order is untouched');
}
{
  const P=boot();
  ok(P.run(`coUnrollCovered(allData.co, {'CO #':'','PCO #':''})`).length===0,
     'a row with no number releases nothing, rather than everything with a blank cover');
}
{
  const P=boot();
  P.run(`allData.co[1]['Rolled Into']='CO-GC-999';`);
  ok(P.run(`coUnrollCovered(allData.co, allData.co[0])`).length===0,
     'and a proposal covered by a different change order stays covered');
}

console.log('Wiring');
{
  const f=html.slice(html.indexOf('function coUnrollCovered'), html.indexOf('async function deleteRow'));
  ok(/wfApplyDecision\('co', x, 'Approved'/.test(f), 'releasing a proposal reopens its chain');
  ok(f.indexOf("x['Status']='Approved'") < f.indexOf('wfApplyDecision'),
     'after the status is set, since wfApplyDecision reads the decision it is given');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-unroll.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
