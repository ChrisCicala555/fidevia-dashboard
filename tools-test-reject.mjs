// A decision against an item closes its review chain.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/const DECIDED_AGAINST=/.test(html), 'the decided-against test exists');
ok(/function wfIsStopped/.test(html) && /function wfApplyDecision/.test(html), 'the helpers exist');

// what counts as a decision against
{
  const RE=/reject|denied|\bden\b|void|withdrawn|cancell?ed/i;
  for (const s of ['Rejected','Denied','Void','Withdrawn','Cancelled','Canceled','rejected'])
    ok(RE.test(s), '"'+s+'" closes the chain');
  for (const s of ['Approved','Open','Under Review','Revise & Resubmit','Approved as Noted','Complete',''])
    ok(!RE.test(s), '"'+s+'" does not');
}

const ad = html.split('function wfApplyDecision')[1].split('function wfProgressHTML')[0];
ok(/headers\.includes\('Workflow Step'\)/.test(ad), 'modules without a workflow are left alone');
ok(/row\['Workflow Status'\]='Rejected'/.test(ad), 'the chain is marked closed');
ok(/row\['Workflow Done'\]=JSON\.stringify\(\[\]\)/.test(ad), 'part-collected signatures are cleared');
ok(/Workflow reopened/.test(ad), 'reversing the decision reopens it');
ok(/steps\.length\?'In Review':''/.test(ad), 'reopening returns it to review rather than to complete');
ok(/auditLog\('Workflow closed/.test(ad), 'closing is recorded');

// wired into where a status is chosen
ok(/const _wfChange=wfApplyDecision\(key, row, status, by\);/.test(html), 'the reply path applies it');
ok(/The review chain is closed, so nobody will be asked to sign it/.test(html), 'and says what happened');
ok(/The review chain is open again, at the step it was left on/.test(html), 'reopening says so too');

// nothing may advance it
{
  const adv = html.split('async function wfAdvance')[1].slice(0, 900);
  ok(/if\(wfIsStopped\(_r0\)\)/.test(adv), 'the client refuses to advance a closed chain');
  ok(/change the status back first/.test(adv), 'and says how to undo it');
}
ok(/reject\|denied\|\\bden\\b\|void\|withdrawn\|cancell\?ed/.test(srv),
   'the server refuses too, which is the copy that matters');
{
  // emailByName is built before the row is loaded, so the window has to be
  // the whole op rather than up to that point.
  const sa = srv.split("op === 'advanceWorkflow'")[1].slice(0, 6000);
  ok(/409/.test(sa), 'the server answers with a conflict rather than pretending');
  ok(sa.indexOf('rows.find') < sa.indexOf('409'), 'the row is loaded before the check');
}

// a stopped chain must not look like a finished one
{
  const pg = html.split('function wfProgressHTML')[1].split('async function wfAdvance')[0];
  ok(/const complete=!stopped && wfIsDone\(r\)/.test(pg), 'complete and stopped are told apart');
  ok(/const isDone = complete \|\| n<gs;/.test(pg),
     'ticks come from completion, not from the chain merely being closed');
  ok(/isDead/.test(pg), 'steps after the stop are marked as never reached');
  ok(/Closed \\u2014 /.test(pg), 'the panel says closed and why');
  ok(/const btn = stopped \? ''/.test(pg), 'no approve button on a closed chain');
  ok((pg.match(/const stopped/g)||[]).length===1, 'stopped is declared once in the function');
}

// archiving still works, since a decided item is finished
ok(/st==='complete' \|\| wfIsStopped\(r\)/.test(html),
   'a closed chain counts as done for archiving and for open-item checks');

// the money side was already right and must stay that way
ok(/return st\.indexOf\('approv'\)>=0 \|\| st\.indexOf\('execut'\)>=0;/.test(html),
   'only approved change orders reach the contract value');
ok(/if\(!coIsApproved\(r\)\) return '';/.test(html),
   'and no document can be generated for one that was not approved');

console.log((bad?'FAIL ':'ok   ')+'tools-test-reject.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
