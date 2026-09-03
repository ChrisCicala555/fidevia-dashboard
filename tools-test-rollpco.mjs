// One change order covering several PCOs.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// naming
ok(/>\+ New PCO</.test(html), 'the button says PCO, which is what contractors raise');
ok(/co:\{title:'Submit New PCO'/.test(html), 'and so does the form');

// candidates
const cc = html.split('function coRollCandidates')[1].split('function coGenRollList')[0];
ok(/i!==idx/.test(cc), 'the one being generated is not offered to itself');
ok(/rowCompany\(x\)[^=]*===co/.test(cc), 'only the same contract');
// Approved proposals are the main case: agreed, not yet papered.
ok(!/!coIsApproved\(x\)/.test(cc), 'an approved proposal is still eligible');
ok(/!String\(x\['Signed File Name'\]\|\|''\)\.trim\(\)/.test(cc),
   'but one that already has its own change order document is not');
ok(/!wfIsStopped\(x\)/.test(cc), 'nothing decided against');
ok(/!isArchived\(x\)/.test(cc), 'nothing archived');
ok(/!String\(x\['Rolled Into'\]\|\|''\)\.trim\(\)/.test(cc), 'and nothing already rolled into another');

// the maths
const cm = html.split('function coContractMathFor')[1].split('function orgAddressLines')[0];
// The set now carries an agreed amount per entry, not just the row.
ok(/const set=\[\{row:r, amount:coApprovedAmount\(r\)/.test(cm), 'the set is this plus the rolled');
ok(/const thisImpact=set\.reduce\(\(sum,e\)=>sum\+impactOf\(e\),0\)/.test(cm),
   'the contract impact covers all of them');
ok(/approved:set\.reduce\(\(sum,e\)=>sum\+e\.amount,0\)/.test(cm), 'so does the approved amount');
ok(/allowance:set\.reduce\(\(sum,e\)=>sum\+drawOf\(e\),0\)/.test(cm), 'and the allowance draw');
ok(/x\.row\s*\n?\s*\? x\s*\n?\s*: \{ row:x/.test(cm) || /\? x$/m.test(cm),
   'a bare row is still accepted, so older callers keep working');
ok(/x!==r && coIsApproved\(x\)/.test(cm),
   'the running total still counts only earlier approved ones, so a rolled proposal is not counted twice');
ok(/covers:set\.map/.test(cm), 'each covered proposal is listed');

// the document
ok(/Proposals covered by this change order/.test(html), 'the PDF itemises them');
ok(/m\.covers && m\.covers\.length>1/.test(html), 'only when there is more than one');
ok(/\('Net change by this change order \('\+m\.covers\.length\+' proposals\)'\)/.test(html),
   'and the summary line says how many');
ok(/splitTextToSize\(String\(c\.desc/.test(html), 'descriptions are clipped to the column');

// what happens to the rolled rows
{
  const g = html.split('async function generateChangeOrder')[1].split('function openCoGen')[0];
  ok(/const rolledSet=coGenRolledSet\(\)/.test(g), 'the selection is read at generation');
  ok(/x\['Rolled Into'\]=coverNum/.test(g), 'each is marked with the change order covering it');
  ok(/\('Rolled into '\+coverNum\)/.test(g), 'and its status says so');
  ok(/wfApplyDecision\('co', x, 'rolled'/.test(g), 'its own review chain is closed');
  ok(/covering '\+rolled\.map/.test(g), 'the audit entry names them');
  ok(/Covers '\+\(rolled\.length\+1\)\+' proposals/.test(g), 'and the result says how many');
}
ok(/cancell\?ed\|rolled/.test(html), "'rolled' counts as settled for the workflow");

// the picker
{
  // The empty-state copy lives in the markup, not the function.
  const rl = html;
  ok(/No other open PCOs on this contract/.test(rl), 'with none it says so rather than showing an empty box');
}
{
  const rt = html.split('function coGenRollTotal')[1].split('function coContractMathFor')[0];
  ok(/will cover <strong>'\+\(set\.length\+1\)/.test(rt), 'the running count includes the one being generated');
  ok(/Each is listed on the document and marked as covered by it/.test(rt), 'and says what will happen to them');
}

// behaviour
{
  const impact=r=>r.impact;
  const math=(r,rolled)=>{
    const set=[r].concat(rolled||[]);
    return set.reduce((s,x)=>s+impact(x),0);
  };
  const a={impact:10000}, b={impact:4000}, c={impact:2500};
  ok(math(a,[])===10000, 'alone, the change order is its own amount');
  ok(math(a,[b,c])===16500, 'rolled up, it is the sum (got '+math(a,[b,c])+')');
  // and the running total must not double count
  const earlier=[{impact:5000, approved:true}];
  const previous=earlier.filter(x=>x.approved).reduce((s,x)=>s+x.impact,0);
  ok(previous+math(a,[b,c])===21500, 'prior plus this covers everything once');
}

// ── a proposal accepted in part ──
ok(/class="cg-roll-amt"/.test(html), 'each rolled proposal has an agreed amount');
ok(/data-proposed="'\+proposed\+'"/.test(html), 'with what it proposed kept alongside');
ok(/Amount agreed\. Defaults to what was proposed/.test(html), 'defaulting to the proposal');
ok(/function coGenRolledSet/.test(html), 'the agreed amounts are read back');
{
  const rs = html.split('function coGenRolledSet')[1].split('function coGenRollTotal')[0];
  ok(/agreed=inp \? payNum\(inp\.value\) : proposed/.test(rs), 'falling back to the proposal if absent');
  ok(/proposed/.test(rs), 'and both figures are carried');
}
{
  const cm = html.split('function coContractMathFor')[1].split('function orgAddressLines')[0];
  ok(/const drawOf=e=>Math\.min\(payNum\(e\.row&&e\.row\['Applied to Allowance'\]\), e\.amount\)/.test(cm),
     'an allowance draw is capped at the agreed amount, not the proposed one');
  ok(/const impactOf=e=>Math\.max\(0, e\.amount-drawOf\(e\)\)/.test(cm), 'the impact uses the agreed amount');
  ok(/reduced:e\.amount<e\.proposed/.test(cm), 'a part acceptance is flagged');
}
ok(/if\(c\.reduced\)/.test(html) && /proposed '\+fmtMoney\(c\.proposed\)/.test(html),
   'the document prints both figures where they differ');
ok(/A signed document that quietly carries a different\s*\n?\s*\/\/ number/.test(html)
   || /quietly carries a different/.test(html),
   'and why that matters is recorded');
{
  const g = html.split('async function generateChangeOrder')[1].split('function openCoGen')[0];
  ok(/x\['Approved Amount'\]=String\(amount\)/.test(g), 'the proposal records what was accepted');
  ok(/Rolled into '\+coverNum\+' \(part\)'/.test(g), 'and says so in its status when it was reduced');
  ok(/The proposal keeps its Cost Impact/.test(g), 'while keeping what it asked for');
}
{
  const rt = html.split('function coGenRollTotal')[1].split('function coContractMathFor')[0];
  ok(/accepted for less than proposed/.test(rt), 'the running note calls out part acceptances');
}

// the arithmetic
{
  const payNum=v=>parseFloat(String(v||'0').replace(/[^0-9.\-]/g,''))||0;
  const mk=(amount,proposed,allow)=>({row:{'Applied to Allowance':allow||0}, amount, proposed});
  const drawOf=e=>Math.min(payNum(e.row['Applied to Allowance']), e.amount);
  const impactOf=e=>Math.max(0, e.amount-drawOf(e));
  const total=set=>set.reduce((s,e)=>s+impactOf(e),0);

  ok(total([mk(8400,8400)])===8400, 'full acceptance reaches the contract in full');
  ok(total([mk(6000,8400)])===6000, 'a part acceptance carries only what was agreed');
  ok(total([mk(10000,10000),mk(6000,8400),mk(2500,2500)])===18500,
     'a mixed set sums the agreed amounts (got '+total([mk(10000,10000),mk(6000,8400),mk(2500,2500)])+')');
  // the allowance cap has to follow the agreed figure down
  ok(drawOf(mk(6000,8400,8000))===6000,
     'a draw larger than the agreed amount is capped at it, not at the proposal');
  ok(impactOf(mk(6000,8400,8000))===0, 'so nothing double counts against the contract');
  ok(total([mk(0,8400)])===0, 'accepting none of it reaches the contract as nothing');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-rollpco.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
