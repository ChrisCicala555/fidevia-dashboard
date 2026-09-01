// A trade has to be chosen, because the number carries it.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/function contractorRoleOptions/.test(html), 'one option builder for both editors');
const ro = html.split('function contractorRoleOptions')[1].split('let WIZ_STEP')[0];
ok(/— Select trade —/.test(ro), 'there is a blank leading option');
ok(/\(sel\?'':' selected'\)/.test(ro), 'and it is selected when nothing is set');
ok(/r\[0\]==='Other'\?'OC':r\[0\]/.test(ro), 'each option shows the code that will appear in numbers');
ok(/cannot quietly be whichever option happens to be first/.test(html),
   'the reason the blank option exists is recorded');

ok(/class="cn-role">'\+contractorRoleOptions\(''\)/.test(html), 'the wizard uses it');
ok(/class="ce-role">'\+contractorRoleOptions\(c\.role\|\|''\)/.test(html), 'the contractors editor does too');
// The builder itself maps CONTRACTOR_ROLES, so count call sites instead.
ok((html.match(/CONTRACTOR_ROLES\.map\(r=>.<option/g)||[]).length===1,
   'only the builder maps the list; neither editor rolls its own');

// creation refuses
{
  const cp = html.split('async function createProject')[1].slice(0, 1200);
  ok(/wizGatherContractors\(\)\.filter\(c=>!c\.role\)/.test(cp), 'creation checks for a missing trade');
  ok(/WIZ_STEP=4; wizShow\(\);/.test(cp), 'and sends you to the step to fix it');
  ok(/numbered CM — as though Fidevia had/.test(cp), 'the consequence is spelled out');
  ok(cp.indexOf('noTrade') < cp.indexOf('showStatus'), 'before anything is created');
}
// the editor warns rather than refuses, since it edits live projects
{
  const sc = html.split('async function saveContractors')[1].split('function closeContractors|async function ')[0];
  ok(/const noTrade=rows\.filter\(r=>!r\.role\)/.test(sc), 'saving checks too');
  ok(/Save anyway\?/.test(sc), 'but allows it, since an existing project may be mid-flight');
  ok(/theirs will read CM until it is set/.test(sc), 'and says what happens meanwhile');
}
// the old single allowance field is gone from that editor
ok(!/class="ce-allowance"/.test(html), 'the superseded allowance field is removed');
{
  const sc = html.split('async function saveContractors')[1].slice(0,1400);
  ok(/if\(prev\.allowances\) carry\.allowances=prev\.allowances/.test(sc),
     'existing allowances are carried through rather than wiped by an editor that no longer shows them');
  ok(/else if\(prev\.allowance!=null\) carry\.allowance=prev\.allowance/.test(sc),
     'including a legacy single figure');
}
// visible where it matters
ok(/const tradeCell = c\.role/.test(html), 'the financial summary shows the trade');
ok(/Not set</.test(html), 'and flags a missing one rather than printing blank');
ok(/out\.push\('<tr><td>'\+tradeCell/.test(html), 'in the contractor row');

console.log((bad?'FAIL ':'ok   ')+'tools-test-trade.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
