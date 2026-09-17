// A trade has to be chosen, because the number carries it.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
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

// The wizard lists the primes against a firm rather than offering one from a
// dropdown, since a firm can hold two and a dropdown cannot say so. The blank
// option still guards every other place a single trade is chosen.
ok(/CONTRACTOR_ROLES\.map\(function\(r\)\{/.test(html) && /class="ct-on"/.test(html),
   'the wizard lists every trade against the firm, each with its own contract');
ok(/class="ce-role">'\+contractorRoleOptions\(c\.role\|\|''\)/.test(html),
   'while the contractors editor still chooses one at a time, and gets the blank option');
ok(/class="ce-role">'\+contractorRoleOptions\(c\.role\|\|''\)/.test(html), 'the contractors editor does too');
// The builder itself maps CONTRACTOR_ROLES, so count call sites instead.
ok((html.match(/CONTRACTOR_ROLES\.map\(r=>.<option/g)||[]).length===1,
   'only the builder maps the list; neither editor rolls its own');

// creation refuses
{
  const cp = html.split('async function createProject')[1].slice(0, 1200);
  ok(/const problems=contractLineProblems\(wizGatherContractors\(\)\);/.test(cp),
     'creation checks the contracts \u2014 a missing trade, and a firm listed twice on one prime, which is '
     +'two contracts nothing could tell apart');
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

console.log('A firm can hold several primes, but not one of them twice');
{
  const P2=bootPage(); P2.run(SEED);
  const probs=(rows)=>P2.run(`contractLineProblems(${JSON.stringify(rows)})`);
  ok(probs([{name:'Garden Spot',role:'MC'},{name:'Garden Spot',role:'PC'}]).length===0,
     'mechanical and plumbing under one firm is ordinary \u2014 two contracts, and the job is multi-prime');
  ok(/listed twice as MC/.test(probs([{name:'Garden Spot',role:'MC'},{name:'Garden Spot',role:'MC'}]).join(' ')),
     'the same prime twice is refused: nothing could tell the two contracts apart');
  ok(/needs its own trade/.test(probs([{name:'Garden Spot',role:'MC'},{name:'Garden Spot',role:''}]).join(' ')),
     'and a second line with no trade is unresolvable in the other direction \u2014 a row filed by that '
     +'firm could not say which contract it belongs to');
  ok(probs([{name:'Summit',role:''}]).length===1,
     'while one firm with no trade is the old warning, unchanged');
  ok(probs([{name:'',role:'MC'}]).length===0, 'an empty row is not yet a problem, it is just empty');
  const note=P2.run(`multiTradeNote(${JSON.stringify([{name:'Garden Spot',role:'MC'},{name:'Garden Spot',role:'PC'}])})`);
  ok(/Garden Spot holds MC and PC/.test(note.join(' ')), 'and what a firm holds is read back \u2014 '+note.join(' '));
  ok(/\u2014 2 contracts, and 2 payment applications a month/.test(note.join(' ')),
     'saying the consequence, since that is the thing somebody has to plan for');
  ok(P2.run(`multiTradeNote(${JSON.stringify([{name:'Summit',role:'GC'}])}).length`)===0,
     'a firm holding one prime needs nothing said about it');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-trade.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
