// "Approved PCOs technically shouldn't be ready to archive — those will need to
// be turned into formal change orders."
//
// Right, and it was worse than it looked. isItemComplete treated any status
// containing "approv" as finished, AND returned true for anything whose review
// chain read Complete — which is exactly what an agreed proposal looks like the
// moment its last reviewer signs. So the single state that must stay in front
// of somebody was the one the log offered to tidy away.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`IS_ADMIN=true; EXTERNAL=false;`);
const R=(o)=>Object.assign({'PCO #':'PCO-GC-004','CO #':'','Description':'Yes the RFI',
  'Company':'Summit Builders','Status':'Open','Rolled Into':'','Archived':'',
  'Workflow Status':'','Workflow Step':'0'}, o);
const settled=(o)=>P.run(`coSettled(${JSON.stringify(R(o))})`);
const archivable=(o)=>P.run(`canArchive('co',${JSON.stringify(R(o))})`);

console.log('The report');
{
  ok(settled({'Status':'Approved'})===false,
     'an approved proposal with no change order number is not settled — it is owed one');
  ok(archivable({'Status':'Approved'})===false, 'so it cannot be archived');
  // The nastier half: its review chain finishing is what makes it approved.
  ok(settled({'Status':'Approved','Workflow Status':'Complete'})===false,
     'and a finished review chain does not settle it either — that is what produced the work');
  ok(archivable({'Status':'Approved','Workflow Status':'Complete'})===false, 'still not archivable');
}

console.log('What is settled');
{
  ok(settled({'Status':'Approved','CO #':'CO-GC-002'})===true,
     'once it carries a change order number it is a change order, and done');
  ok(archivable({'Status':'Approved','CO #':'CO-GC-002'})===true, 'and can be archived');
  ok(settled({'Status':'Rolled into CO-GC-002','Rolled Into':'CO-GC-002'})===true,
     'a proposal covered by another change order is settled');
  ok(settled({'Status':'Rejected'})===true, 'a rejected one is settled — there is nothing to issue');
  ok(settled({'Status':'Denied'})===true, 'and a denied one');
  ok(settled({'Status':'Open','Workflow Status':'Rejected'})===true,
     'a chain decided against settles it whatever the status column says');
}

console.log('What is plainly not');
{
  ok(settled({'Status':'Open'})===false, 'an open proposal');
  ok(settled({'Status':'Under Review','Workflow Status':'In Review'})===false, 'one being reviewed');
  ok(settled(null)===false, 'and nothing at all');
  ok(archivable({'Status':'Approved','CO #':'CO-GC-002','Archived':'Yes'})===false,
     'something already archived is not offered again');
}

console.log('The bulk button counts the same way');
{
  P.run(`allData.co=[
    ${JSON.stringify(R({'PCO #':'PCO-GC-001','Status':'Approved'}))},
    ${JSON.stringify(R({'PCO #':'PCO-GC-002','CO #':'CO-GC-001','Status':'Approved'}))},
    ${JSON.stringify(R({'PCO #':'PCO-GC-003','Status':'Rejected'}))},
    ${JSON.stringify(R({'PCO #':'PCO-GC-004','Status':'Open'}))}];`);
  ok(P.run(`archivableIdx('co')`).join()==='1,2',
     'only the executed one and the rejected one — got '+P.run(`archivableIdx('co')`).join());
  ok(P.run(`archiveAllBtnHTML('co')`).indexOf('>Archive (2)<')>=0, 'and the button says two');
}

console.log('Other modules are untouched');
{
  ok(P.run(`isItemComplete('rfi',{'Status':'Closed'})`)===true, 'a closed RFI is still complete');
  ok(P.run(`isItemComplete('rfi',{'Status':'Open','Workflow Status':'Complete'})`)===true,
     'and an RFI whose chain finished still is — the rule that changed is the change order one');
  ok(P.run(`isItemComplete('sub',{'Status':'Approved'})`)===true, 'an approved submittal is complete');
  ok(P.run(`isItemComplete('sub',{'Status':'Pending Review'})`)===false, 'a pending one is not');
}

console.log('Where the rule lives');
{
  const f=html.slice(html.indexOf('function isItemComplete'), html.indexOf('function canArchive'));
  ok(/if\(key==='co'\) return coSettled\(r\);/.test(f), 'change orders answer to their own rule');
  ok(f.indexOf("if(key==='co')") < f.indexOf('if(wfIsDone(r)) return true;'),
     'asked before the workflow, or a finished chain would settle an unpapered proposal');
  ok(!/if\(key==='co'\)\s+return st\.indexOf\('approv'\)/.test(html),
     'and the old any-approval rule is gone');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-pcoarchive.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
