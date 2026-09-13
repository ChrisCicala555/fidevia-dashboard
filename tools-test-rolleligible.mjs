// "It's saying no PCOs are covered here for some reason."
//
// PCO-GC-001 was on the log, on the right contract, open — and the New CO
// dialog said there were none to cover. The picker excluded any row with a
// Signed File Name, which reads as "this already has its own document". But on
// a PROPOSAL that field is set by generating the proposal document — the
// ordinary first step, the thing you send out to get it agreed. So the normal
// sequence (raise PCO, generate its document, agree it, roll it into a change
// order) made the proposal invisible at the last step.
//
// Both pickers had the same wrong test, written separately. They now share one.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

const CO=(o)=>Object.assign({'PCO #':'','CO #':'','Description':'','Company':'Summit Builders',
  'Status':'Approved','Cost Impact':'5000','Approved Amount':'5000','Rolled Into':'',
  'Signed File ID':'','Signed File Name':'','Archived':'','Workflow Status':''}, o);

const boot=(cos)=>{
  const P=bootPage(); P.run(SEED);
  P.run(`
    IS_ADMIN=true; EXTERNAL=false;
    currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'2000000',active:true},
                                       {name:'Delaney Mechanical',role:'MC',contract:'500000',active:true}];
    allData.co=${JSON.stringify(cos)};
  `);
  return P;
};

console.log('The report: a proposal whose document has been generated');
{
  const P=boot([CO({'PCO #':'PCO-GC-001','Description':'Rationale to build a bigger building',
    'Signed File ID':'f1','Signed File Name':'Summit Builders — PCO-GC-001.pdf'})]);
  ok(P.run(`coRollEligible(allData.co[0])`)===true,
     'a generated proposal document does not stop the proposal being rolled up');
  ok(P.run(`coRollCandidatesFor('Summit Builders').length`)===1, 'so the picker offers it');
  P.run(`document.getElementById('nc-company').value='Summit Builders'; newCoCompanyChanged();`);
  ok(P.run(`document.getElementById('nc-roll-list').style.display`)!=='none', 'and the New CO list is shown');
  ok(/PCO-GC-001/.test(P.run(`document.getElementById('nc-roll-list').innerHTML`)), 'with the proposal in it');
  ok(P.run(`document.getElementById('nc-roll-none').style.display`)==='none', 'not the "no open PCOs" line');
}

console.log('What still must not be offered');
{
  const P=boot([
    CO({'PCO #':'PCO-001','CO #':'CO-004'}),                       // became a change order
    CO({'PCO #':'PCO-002','Rolled Into':'CO-003'}),                // already covered
    CO({'PCO #':'PCO-003','Archived':'Yes'}),               // archived
    CO({'PCO #':'PCO-004','Workflow Status':'Rejected'}),          // decided against
    CO({'PCO #':'PCO-005','Company':'Delaney Mechanical'}),        // another contract
    CO({'PCO #':'PCO-006'})                                        // the only live one
  ]);
  const got=P.run(`coRollCandidatesFor('Summit Builders').map(e=>e.x['PCO #'])`);
  ok(got.join()==='PCO-006', 'only the loose proposal on this contract is offered — got '+got.join(','));
  ok(P.run(`coRollEligible(allData.co[0])`)===false, 'a row that is already a change order is not a proposal');
  ok(P.run(`coRollCandidatesFor('Delaney Mechanical').map(e=>e.x['PCO #'])`).join()==='PCO-005',
     "and the other contract's proposal is offered under that contract");
  ok(P.run(`coRollCandidatesFor('').length`)===0, 'no contract chosen offers nothing');
  // A row whose company never got written would otherwise match the empty
  // string and be offered to whoever opened the dialog without choosing yet.
  P.run(`allData.co.push(${JSON.stringify(CO({'PCO #':'PCO-ORPHAN','Company':'','Submitted By':'Someone'}))});`);
  ok(P.run(`coRollCandidatesFor('').length`)===0,
     'and a proposal with no company on it is not offered to a dialog with no contract chosen');
  ok(P.run(`coRollCandidatesFor('Summit Builders').map(e=>e.x['PCO #'])`).join()==='PCO-006',
     'nor does it attach itself to a real contract');
  P.run(`allData.co=allData.co.filter(r=>r['PCO #']!=='PCO-ORPHAN');`);

  // The empty picker has to account for itself.
  P.run(`document.getElementById('nc-company').value='Delaney Mechanical'; newCoCompanyChanged();`);
  const none=P.run(`document.getElementById('nc-roll-none').innerHTML`);
  ok(P.run(`document.getElementById('nc-roll-none').style.display`)==='none',
     'Delaney has one, so nothing is claimed about having none');

  P.run(`allData.co=allData.co.filter(r=>r['PCO #']!=='PCO-006' && r['Company']!=='Delaney Mechanical');
         document.getElementById('nc-company').value='Summit Builders'; newCoCompanyChanged();`);
  const msg=P.run(`document.getElementById('nc-roll-none').innerHTML`);
  ok(/4 on file/.test(msg), 'with none eligible it says how many are on the contract rather than implying zero');
  ok(/PCO-001 is a change order already/.test(msg), 'and why each one is out');
  ok(/PCO-002 is covered by CO-003/.test(msg), 'naming what covered it');
  ok(/PCO-003 is archived/.test(msg) && /PCO-004 was decided against/.test(msg), 'for every reason');
}
{
  // A contract with genuinely nothing on it should not grow an explanation.
  const P=boot([CO({'PCO #':'PCO-001','Company':'Delaney Mechanical'})]);
  P.run(`document.getElementById('nc-company').value='Summit Builders'; newCoCompanyChanged();`);
  const msg=P.run(`document.getElementById('nc-roll-none').innerHTML`);
  ok(/stand on its own/.test(msg) && !/cannot be covered/.test(msg),
     'nothing on the contract says just that, with no list of reasons');
}

console.log('The generator picker agrees with the New CO picker');
{
  const P=boot([
    CO({'CO #':'CO-001','Description':'The change order being generated'}),
    CO({'PCO #':'PCO-001','Signed File Name':'proposal.pdf'}),
    CO({'PCO #':'PCO-002'})
  ]);
  const got=P.run(`coRollCandidates(0).map(e=>e.x['PCO #'])`);
  ok(got.join()==='PCO-001,PCO-002', 'the generator offers both proposals, generated document or not');
  ok(P.run(`coRollCandidates(1).map(e=>e.i)`).join()==='2',
     'and generating from a proposal does not offer that proposal to itself');
  ok(P.run(`coRollCandidatesFor('Summit Builders',0).map(e=>e.x['PCO #'])`).join()===got.join(),
     'both pickers are the same list, because they are now the same function');
}

console.log('Wiring');
ok(!/&& !String\(x\['Signed File Name'\]\|\|''\)\.trim\(\)/.test(html),
   'no picker excludes a proposal for having a generated document any more');
{
  const f=html.slice(html.indexOf('function newCoCompanyChanged()'));
  ok(/coRollCandidatesFor\(co\)/.test(f.slice(0, f.indexOf('\nfunction '))),
     'the New CO picker uses the shared list rather than its own copy of the filter');
}
ok(/function coRollCandidates\(idx\)\{[\s\S]{0,200}coRollCandidatesFor\(rowCompany\(r\), idx\)/.test(html),
   'and so does the generator');

console.log((bad?'FAIL':'ok  ')+' tools-test-rolleligible.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
