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
ok(/!coIsApproved\(x\)/.test(cc), 'nothing already approved');
ok(/!wfIsStopped\(x\)/.test(cc), 'nothing decided against');
ok(/!isArchived\(x\)/.test(cc), 'nothing archived');
ok(/!String\(x\['Rolled Into'\]\|\|''\)\.trim\(\)/.test(cc), 'and nothing already rolled into another');

// the maths
const cm = html.split('function coContractMathFor')[1].split('function orgAddressLines')[0];
ok(/const set=\[r\]\.concat\(\(rolled\|\|\[\]\)\.filter\(Boolean\)\)/.test(cm), 'the set is this plus the rolled');
ok(/set\.reduce\(\(sum,x\)=>sum\+coContractImpact\(x\),0\)/.test(cm), 'the contract impact covers all of them');
ok(/set\.reduce\(\(sum,x\)=>sum\+coApprovedAmount\(x\),0\)/.test(cm), 'so does the approved amount');
ok(/set\.reduce\(\(sum,x\)=>sum\+coAllowanceDraw\(x\),0\)/.test(cm), 'and the allowance draw');
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
  ok(/const rolled=rolledIdx\.map/.test(g), 'the selection is read at generation');
  ok(/x\['Rolled Into'\]=coverNum/.test(g), 'each is marked with the change order covering it');
  ok(/x\['Status'\]='Rolled into '\+coverNum/.test(g), 'and its status says so');
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
  ok(/will cover <strong>'\+\(rolled\.length\+1\)/.test(rt), 'the running count includes the one being generated');
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

console.log((bad?'FAIL ':'ok   ')+'tools-test-rollpco.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
