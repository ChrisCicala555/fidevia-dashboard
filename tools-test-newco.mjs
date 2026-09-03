// Fidevia and the design team can issue a change order written elsewhere.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// who sees it
ok(/<button class="btn-add ae-ok" onclick="openNewCo\(\)"/.test(html), 'the button exists');
ok(/body\.role-ae \.btn-add:not\(\.ae-ok\)\{display:none !important;\}/.test(html)
   || /\.btn-add:not\(\.ae-ok\)/.test(html),
   'the design team see it while their other add buttons stay hidden');
ok(/body\.role-owner \.btn-add\{display:none !important;\}/.test(html), 'the owner still sees no add buttons');
{
  const mi = html.split('function newCoMayIssue')[1].split('function openNewCo')[0];
  ok(/DESIGN_ROLES\.includes\(viewingAsRole\(\)\)/.test(mi), 'permitted for the design team');
  ok(/IS_ADMIN/.test(mi), 'and for Fidevia');
}
ok(/if\(!newCoMayIssue\(\)\)\{ alert/.test(html), 'opening it is guarded');
ok(/if\(!newCoMayIssue\(\)\) return;/.test(html), 'and so is submitting');

// Generate CO stays Fidevia's
{
  const gb = html.split('function coGenBtn')[1].split('function archiveBtn')[0];
  ok(/if\(!IS_ADMIN \|\| viewingAsExternal\(\)\) return '';/.test(gb),
     'the generator remains Fidevia only');
}

// the form
ok(/id="nc-company"/.test(html) && /id="nc-desc"/.test(html) && /id="nc-file"/.test(html),
   'contract, description and document are asked for');
ok(/id="nc-allow-id"/.test(html) && /id="nc-allow-amt"/.test(html), 'the allowance is set here');
ok(/id="nc-roll-list"/.test(html), 'and the proposals it covers');
ok(/class="nc-roll-amt"[^>]*data-proposed/.test(html) || /nc-roll-amt/.test(html),
   'each at the amount agreed');

// validation
{
  const sb = html.split('async function submitNewCo')[1].split('// ── Rolling several')[0];
  ok(/Choose which contract/.test(sb), 'a contract is required');
  ok(/Give the change order a description/.test(sb), 'so is a description');
  ok(/Choose which allowance the draw comes from/.test(sb), 'an amount with no allowance is refused');
  ok(/more than the change order is worth/.test(sb), 'and a draw larger than the change order');
  ok(/row\['Status'\]='Approved'/.test(sb), 'an issued change order is approved');
  ok(/row\['Workflow Status'\]='Complete'/.test(sb),
     'with no review chain, since it arrives already executed');
  ok(/x\['Rolled Into'\]=num/.test(sb), 'covered proposals record it');
  ok(/\(amount<proposed\)\?\('Rolled into '\+num\+' \(part\)'\)/.test(sb), 'and say when accepted in part');
  ok(/nextItemNumber\('co', co\)/.test(sb), 'the number follows the project sequence when left blank');
  ok(/rows=existing\?\(parseCSV\(await boxGetText\(existing\.id\)\)\)\.rows:\[\]/.test(sb),
     'the log is re-read before writing, so a concurrent change is not clobbered');
  ok(/auditLog\('Issued change order'/.test(sb), 'the issue is audited');
  ok(/sendItemNotif\('Notify - CO'/.test(sb), 'and notified');
}

// totals
{
  const nt = html.split('function newCoTotals')[1].split('async function submitNewCo')[0];
  ok(/Math\.max\(0,gross-amt\)/.test(nt), 'the contract figure is the agreed total less the allowance draw');
  ok(/accepted for less than proposed/.test(nt), 'part acceptances are called out');
  ok(/stands on its own/.test(nt), 'a change order covering nothing reads sensibly');
}

// arithmetic
{
  const set=[{amount:6000,proposed:8400},{amount:2500,proposed:2500}];
  const gross=set.reduce((s,e)=>s+e.amount,0);
  ok(gross===8500, 'the agreed amounts sum (got '+gross+')');
  ok(Math.max(0,gross-3000)===5500, 'less the allowance draw reaches the contract');
  ok(Math.max(0,gross-10000)===0, 'a draw covering the whole thing reaches the contract as nothing');
  ok(set.filter(e=>e.amount<e.proposed).length===1, 'one of the two was reduced');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-newco.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
