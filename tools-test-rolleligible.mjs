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

console.log('A rejected proposal, and the way back');
{
  // What Christopher actually hit, after the Signed File Name fix: PCO-GC-001
  // had been decided against during the override testing, and "was decided
  // against" was a dead end — renegotiating a rejected proposal and then
  // issuing the change order is ordinary work.
  const P=boot([CO({'PCO #':'PCO-GC-001','Status':'Rejected','Workflow Status':'Rejected'})]);
  P.run(`document.getElementById('nc-company').value='Summit Builders'; newCoCompanyChanged();`);
  const msg=P.run(`document.getElementById('nc-roll-none').innerHTML`);
  ok(/PCO-GC-001 was decided against/.test(msg), 'the reason is named');
  ok(/coReopenProposal\(0\)/.test(msg), 'with a way to put it back, pointed at the right row');

  // Reopening, with Box answered locally.
  P.run(`CALLS=[]; findFile=async()=>({id:'log'}); boxGetText=async()=>'';
         boxUploadText=async()=>{ CALLS.push('save'); return {}; };
         auditLog=async(a,k,r,d)=>{ AUDIT=a+'|'+d; }; resolveMe=async()=>{}; renderAll=()=>{};
         confirm=()=>true; AUDIT='';`);
  await P.run(`coReopenProposal(0)`);
  ok(P.run(`allData.co[0]['Workflow Status']`)!=='Rejected', 'the rejection is lifted');
  ok(P.run(`wfIsStopped(allData.co[0])`)===false, 'so the row is no longer stopped');
  ok(P.run(`allData.co[0]['Status']`)==='Open', 'and the status says open rather than rejected');
  ok(P.run(`CALLS`).join()==='save', 'the log is written once');
  ok(/Reopened proposal\|PCO-GC-001/.test(P.run(`AUDIT`)), 'and the audit log records it by number');
  ok(P.run(`coRollCandidatesFor('Summit Builders').map(e=>e.x['PCO #'])`).join()==='PCO-GC-001',
     'after which it is offered — which was the whole point');
  // Without redrawing by hand: the dialog is open and must not need closing
  // and reopening to show what just changed under it.
  ok(/PCO-GC-001/.test(P.run(`document.getElementById('nc-roll-list').innerHTML`)),
     'and the open picker has already refilled itself');
  ok(P.run(`document.getElementById('nc-roll-list').style.display`)!=='none', 'and is showing');
}
{
  // Nothing to reopen is not an error, it is a no-op — and must not write.
  const P=boot([CO({'PCO #':'PCO-001'})]);
  P.run(`CALLS=[]; findFile=async()=>{ CALLS.push('find'); return {id:'log'}; };
         boxUploadText=async()=>{ CALLS.push('save'); return {}; };
         resolveMe=async()=>{}; renderAll=()=>{}; confirm=()=>true;`);
  await P.run(`coReopenProposal(0)`);
  ok(P.run(`CALLS`).length===0, 'reopening a proposal that was never closed writes nothing');
  ok(P.run(`allData.co[0]['Status']`)!=='Open', 'and does not rewrite its status');
  await P.run(`coReopenProposal(99)`);
  ok(P.run(`CALLS`).length===0, 'nor does a row index that is not there');
}
{
  // Only Fidevia, and only a decision. The other three reasons are facts.
  const P=boot([
    CO({'PCO #':'PCO-001','Workflow Status':'Rejected'}),
    CO({'PCO #':'PCO-002','CO #':'CO-009'}),
    CO({'PCO #':'PCO-003','Rolled Into':'CO-003'}),
    CO({'PCO #':'PCO-004','Archived':'Yes'})
  ]);
  const flags=P.run(`coRollExcluded('Summit Builders').map(e=>e.num+':'+(e.reopenable?'y':'n'))`);
  ok(flags.join()==='PCO-001:y,PCO-002:n,PCO-003:n,PCO-004:n',
     'only the rejection is offered as reversible — got '+flags.join(','));
  P.run(`document.getElementById('nc-company').value='Summit Builders'; newCoCompanyChanged();`);
  const four=P.run(`document.getElementById('nc-roll-none').innerHTML`);
  ok((four.match(/coReopenProposal\(/g)||[]).length===1,
     'so exactly one of the four reasons carries a link');
  ok(/coReopenProposal\(0\)/.test(four), 'pointed at the rejected row');

  P.run(`EXTERNAL=true; VIEW_AS='contractor'; document.getElementById('nc-company').value='Summit Builders'; newCoCompanyChanged();`);
  ok(!/coReopenProposal/.test(P.run(`document.getElementById('nc-roll-none').innerHTML`)),
     'a contractor is not offered the link');
  P.run(`EXTERNAL=false; VIEW_AS=''; IS_ADMIN=false; document.getElementById('nc-company').value='Summit Builders'; newCoCompanyChanged();`);
  ok(!/coReopenProposal/.test(P.run(`document.getElementById('nc-roll-none').innerHTML`)),
     'nor is a non-admin');
  // And the handler refuses even if the link is reached another way.
  P.run(`ALERTED=''; alert=(m)=>{ ALERTED=m; }; confirm=()=>true;`);
  await P.run(`coReopenProposal(0)`);
  ok(P.run(`allData.co[0]['Workflow Status']`)==='Rejected', 'the row is untouched by a caller who may not');
  ok(/Only Fidevia/.test(P.run(`ALERTED`)), 'and is told why');
  // Fidevia previewing the contractor's view is looking at somebody else's
  // screen, and must not be able to act from it.
  // viewingAsExternal reads the body class, which is what the preview toggle
  // sets — not VIEW_AS. Setting the wrong one made this pass for the wrong
  // reason: the call went through and failed on the unstubbed upload instead.
  P.run(`IS_ADMIN=true; EXTERNAL=false; document.body.classList.add('external-mode'); ALERTED='';`);
  ok(P.run(`viewingAsExternal()`)===true, 'the preview really is on');
  await P.run(`coReopenProposal(0)`);
  ok(P.run(`allData.co[0]['Workflow Status']`)==='Rejected',
     'and Fidevia previewing as a contractor cannot reopen from inside that preview');
  ok(/Only Fidevia/.test(P.run(`ALERTED`)), 'being told the same thing the contractor would be');
  P.run(`document.body.classList.remove('external-mode');`);
}
{
  // A failed write must not leave the screen claiming a state Box never took.
  const P=boot([CO({'PCO #':'PCO-001','Status':'Rejected','Workflow Status':'Rejected'})]);
  P.run(`findFile=async()=>({id:'log'}); boxGetText=async()=>'';
         boxUploadText=async()=>{ throw new Error('Box said no'); };
         resolveMe=async()=>{}; renderAll=()=>{}; confirm=()=>true; ALERTED=''; alert=m=>{ALERTED=m;};`);
  await P.run(`coReopenProposal(0)`);
  ok(P.run(`allData.co[0]['Workflow Status']`)==='Rejected', 'the rejection is put back when the save fails');
  ok(P.run(`allData.co[0]['Status']`)==='Rejected', 'status and all');
  ok(/Box said no/.test(P.run(`ALERTED`)), 'and the failure is reported rather than swallowed');
}
{
  const P=boot([CO({'PCO #':'PCO-001','Status':'Rejected','Workflow Status':'Rejected'})]);
  P.run(`confirm=()=>false; findFile=async()=>{ CALLED=true; }; CALLED=false; resolveMe=async()=>{};`);
  await P.run(`coReopenProposal(0)`);
  ok(P.run(`allData.co[0]['Workflow Status']`)==='Rejected', 'declining the confirmation changes nothing');
  ok(P.run(`CALLED`)===false, 'and touches Box not at all');
}

{
  // The link has to carry the row's own index, not the first one on the list.
  const P=boot([
    CO({'PCO #':'PCO-001','CO #':'CO-009'}),
    CO({'PCO #':'PCO-002','Archived':'Yes','Workflow Status':'Rejected'}),
    CO({'PCO #':'PCO-003','Workflow Status':'Rejected'})
  ]);
  const ex=P.run(`coRollExcluded('Summit Builders').map(e=>e.num+':'+e.i+':'+(e.reopenable?'y':'n'))`);
  ok(ex.join()==='PCO-001:0:n,PCO-002:1:n,PCO-003:2:y',
     'an archived proposal stays out even when it was also rejected, since reopening would not unarchive it — got '+ex.join(','));
  P.run(`document.getElementById('nc-company').value='Summit Builders'; newCoCompanyChanged();`);
  const msg=P.run(`document.getElementById('nc-roll-none').innerHTML`);
  ok(/coReopenProposal\(2\)/.test(msg), 'and the link names that row, not the first');
  ok(!/coReopenProposal\(0\)/.test(msg) && !/coReopenProposal\(1\)/.test(msg), 'and only that row');
}

console.log('A proposal recorded under a name that is not the contract');
{
  // The report came back a second time after the Signed File Name fix, which
  // means the row was falling out for one of the other reasons — and the
  // message said none of them. A proposal is tied to a contract by a name
  // written on the row; if that name is not exactly the contractor's, the row
  // belongs to nobody and the picker is empty while the log shows the PCO.
  const P=boot([CO({'PCO #':'PCO-GC-001','Company':'Summit Builders LLC'})]);
  P.run(`document.getElementById('nc-company').value='Summit Builders'; newCoCompanyChanged();`);
  const msg=P.run(`document.getElementById('nc-roll-none').innerHTML`);
  ok(/Summit Builders LLC/.test(msg), 'the message quotes the name actually on the row');
  ok(/PCO-GC-001/.test(msg), 'and names the proposal, so it can be found');
  ok(/not a contract on this project/.test(msg), 'saying it matches no contract at all');
  ok(/Correct the company on the row/.test(msg), 'and what to do about it');
}
{
  // Another contractor's proposal is a different thing: it is fine, it just
  // belongs to the other contract.
  const P=boot([CO({'PCO #':'PCO-005','Company':'Delaney Mechanical'})]);
  P.run(`document.getElementById('nc-company').value='Summit Builders'; newCoCompanyChanged();`);
  const msg=P.run(`document.getElementById('nc-roll-none').innerHTML`);
  ok(/Delaney Mechanical/.test(msg), 'a real contract is named too');
  ok(!/belongs to nobody/.test(msg), 'but not accused of being orphaned');
  ok(/Choose that contract above/.test(msg), 'since choosing it is the whole fix');
}
{
  // Both problems at once, on the contract and off it.
  const P=boot([
    CO({'PCO #':'PCO-001','Workflow Status':'Rejected'}),
    CO({'PCO #':'PCO-002','Company':'Summit Builders LLC'})
  ]);
  P.run(`document.getElementById('nc-company').value='Summit Builders'; newCoCompanyChanged();`);
  const msg=P.run(`document.getElementById('nc-roll-none').innerHTML`);
  ok(/PCO-001 was decided against/.test(msg), 'the one on the contract is accounted for');
  ok(/PCO-002/.test(msg) && /Summit Builders LLC/.test(msg), 'and the one off it, in the same sentence');
}
{
  // A row with no company at all is orphaned rather than everybody's.
  const P=boot([CO({'PCO #':'PCO-007','Company':'','Submitted By':'Someone'})]);
  P.run(`document.getElementById('nc-company').value='Summit Builders'; newCoCompanyChanged();`);
  const msg=P.run(`document.getElementById('nc-roll-none').innerHTML`);
  ok(/no company/.test(msg), 'a blank company is said in words rather than as an empty quote');
  ok(/belongs to nobody/.test(msg), 'and treated as orphaned');
  ok(P.run(`coRollElsewhere('Summit Builders')[0].orphan`)===true,
     'because no contract is called nothing');
}
{
  // Asked directly rather than through the empty picker, which only calls it
  // when there is nothing on the contract anyway.
  const P=boot([
    CO({'PCO #':'PCO-001'}),                                        // eligible, this contract
    CO({'PCO #':'PCO-002','Company':'Delaney Mechanical'}),         // eligible, elsewhere
    CO({'PCO #':'PCO-003','Company':'Delaney Mechanical','Workflow Status':'Rejected'})
  ]);
  const away=P.run(`coRollElsewhere('Summit Builders').map(e=>e.num)`);
  ok(away.join()==='PCO-002', 'only proposals that a change order could actually cover are named');
  ok(!away.includes('PCO-001'), "not the ones already on this contract, which the picker is showing");
  ok(!away.includes('PCO-003'),
     'and not one decided against, which is not waiting for a contract to be chosen');
}
{
  // And a project where there genuinely is nothing keeps the short sentence.
  const P=boot([]);
  P.run(`document.getElementById('nc-company').value='Summit Builders'; newCoCompanyChanged();`);
  const msg=P.run(`document.getElementById('nc-roll-none').innerHTML`);
  ok(msg==='No open PCOs on this contract. The change order will stand on its own.',
     'nothing on the project at all says only that');
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
ok(/function coRollCandidates\(idx\)\{[\s\S]{0,200}coRollCandidatesFor\(coContractorOf\(r\), idx\)/.test(html),
   'and so does the generator, asking by the contract the change is against');

console.log((bad?'FAIL':'ok  ')+' tools-test-rolleligible.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
