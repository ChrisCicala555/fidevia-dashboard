// "Does not match when I change workflows. Fidevia already did their review —
// it should just be in the architect's hands now."
//
// The status was written at the moment of a review and then left alone, so it
// named whoever the chain pointed at that day. Edit the chain afterwards and
// the row goes on naming people the chain no longer names.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
const chain=(js)=>P.run(`wfEffectiveSteps=function(){ return ${js}; };`);
const FID={name:'Fidevia Review', person:'Christopher Cicala', company:'Fidevia'};
const ARCH={name:'Architect Review', person:'Test Architect', company:'Architect 2'};
const ROW=(o)=>Object.assign({'App #':'PA #01','Contractor':'Summit Builders','Company':'Summit Builders',
  'Copy Type':'Pencil','Status':'Pencil — awaiting Christopher Cicala, Test Architect',
  'Workflow Step':'1','Workflow Status':'In Review','Workflow Done':''}, o);
const label=(o)=>P.run(`payStatusLabel(${JSON.stringify(ROW(o))})`);
const withNow=(o)=>P.run(`payWithNow(${JSON.stringify(ROW(o))})`);

console.log('The chain says where it is, not a sentence written last week');
{
  // The case in front of us: three steps became two, and the stored status
  // still names both of the people the old chain pointed at.
  chain(`[${JSON.stringify(FID)},${JSON.stringify(ARCH)}]`);
  ok(withNow().join()==='Test Architect', 'it is with the architect');
  ok(label()==='Pencil — with Test Architect',
     'and says so, rather than repeating a sentence about a chain that no longer exists');
  ok(!/Christopher Cicala/.test(label()), 'Fidevia has done theirs and is not still being waited on');
}
{
  chain(`[${JSON.stringify(FID)},${JSON.stringify(ARCH)}]`);
  ok(label({'Workflow Step':'0'})==='Pencil — with Christopher Cicala',
     'at the first step it is with Fidevia');
  ok(label({'Copy Type':'Final','Workflow Step':'1'})==='With Test Architect',
     'and a final application says it without the word pencil');
}
{
  // A step removed can leave the row pointing past the end of the chain.
  chain(`[${JSON.stringify(FID)}]`);
  ok(label({'Workflow Step':'5'})==='Pencil — with Christopher Cicala',
     'a row left past the end of a shortened chain reads as the last step, not as nothing');
  ok(label({'Workflow Step':'-3'})==='Pencil — with Christopher Cicala', 'and one left before the start');
}
{
  // Parallel: both at once, and whoever has answered drops off.
  chain(`[${JSON.stringify(FID)},${JSON.stringify(Object.assign({}, ARCH, {parallel:true}))}]`);
  ok(label({'Workflow Step':'0'})==='Pencil — with Christopher Cicala, Test Architect',
     'a parallel group is with everybody in it');
  ok(label({'Workflow Step':'0','Workflow Done':'[0]'})==='Pencil — with Test Architect',
     'until one of them answers, and then it is with the rest');
  ok(label({'Workflow Step':'0','Workflow Done':'not json'})
       ==='Pencil — with Christopher Cicala, Test Architect',
     'and unreadable history does not drop anybody off it');
  ok(label({'Workflow Step':'0','Workflow Done':'{}'})
       ==='Pencil — with Christopher Cicala, Test Architect',
     'nor history that reads as something other than a list');
}
{
  chain(`[{name:'Owner Review', person:'', company:'Riverside School District'}]`);
  ok(label({'Workflow Step':'0'})==='Pencil — with Riverside School District',
     'a step with a firm and no person names the firm');
  chain(`[{name:'Third Party Review', person:'', company:''}]`);
  ok(label({'Workflow Step':'0'})==='Pencil — with Third Party Review',
     'and one with neither falls back to what the step is called');
}

console.log('A decision is the row’s to state, not the chain’s');
{
  chain(`[${JSON.stringify(FID)},${JSON.stringify(ARCH)}]`);
  ['Pencil approved — awaiting final','Pencil approved as noted — awaiting final',
   'Approved & Signed','Denied','Pencil rejected'].forEach(st=>
    ok(label({'Status':st})===st, '"'+st+'" is what happened, and stands'));
  ok(label({'Status':'Revise and resubmit — awaiting contractor'})
       ==='Revise and resubmit — awaiting contractor',
     'a return names the contractor it is with, not the reviewer whose step it still sits on');
}
{
  ok(label({'Workflow Status':''})==='Pencil — awaiting Christopher Cicala, Test Architect',
     'a row with no chain running keeps whatever it says');
  chain(`[]`);
  ok(label()==='Pencil — awaiting Christopher Cicala, Test Architect',
     'and so does a project with no chain configured');
  P.run(`wfEffectiveSteps=function(){ throw new Error('no'); };`);
  ok(label()==='Pencil — awaiting Christopher Cicala, Test Architect',
     'a chain that cannot be read leaves the row reading as it did');
  ok(P.run(`payWithNow(${JSON.stringify(ROW())})`).length===0, 'rather than throwing into the log');
  ok(P.run(`payStatusLabel({})`)==='Submitted', 'and a row with no status at all reads as submitted');
}
{
  chain(`[${JSON.stringify(FID)},${JSON.stringify(ARCH)}]`);
  ok(P.run(`payWithNow(${JSON.stringify(ROW({'Workflow Status':'Rejected'}))})`).length===0,
     'a closed chain is with nobody');
  ok(P.run(`payWithNow(${JSON.stringify(ROW({'Workflow Status':'Complete'}))})`).length===0,
     'and so is a finished one');
}

console.log('And the log uses it');
{
  ok(/const s=payStatusLabel\(r\);/.test(html), 'every row is labelled from the chain as it stands');
  ok(!/const s=r\['Status'\]\|\|'Submitted';/.test(html), 'not from the sentence stored on it');
  ok(/payStatusColor\(s\)/.test(html), 'and the colour follows the same words');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-paywith.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
