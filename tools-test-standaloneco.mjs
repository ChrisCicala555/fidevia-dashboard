// Two things, both found while tidying the allowance rows.
//
// 1. The allowance header was drawn with an inline display:flex and then shown
//    or hidden by setting style.display='' — which removes the inline value
//    outright. The header became a plain block and its two labels ran together:
//    ALLOWANCEAMOUNT ($). Now one wrapper is toggled and the header keeps its
//    own display.
//
// 2. A change order issued with no proposal behind it had nowhere to say what
//    it was worth. The total came only from rolled-in proposals, so it recorded
//    zero and the contract did not move.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

console.log('Showing and hiding does not destroy the layout');
{
  ok(/id="nc-allow-wrap"/.test(html) && /id="cg-allow-wrap"/.test(html),
     'one wrapper per dialog carries the header, the rows and the button');
  ok(/\{ const el=document\.getElementById\('nc-allow-wrap'\); if\(el\) el\.style\.display=show; \}/.test(html),
     'and the wrapper is what gets toggled');
  ok(!/'nc-allow-head'/.test(html) && !/'cg-allow-head'/.test(html),
     'nothing sets display on the header any more — style.display="" wipes the inline flex that made it a row');
  const head = (html.match(/<div class="allow-head">[\s\S]{0,220}?<\/div>/)||[''])[0];
  ok(/class="allow-c1">Allowance<\/span>/.test(head) && /class="allow-c2">Amount \(\$\)<\/span>/.test(head),
     'the two labels are separate spans in classes, not inline styles that a toggle can erase');
}
{
  const css = html.split('.allow-head,.allow-row{')[1].split('}')[0];
  ok(/display:flex/.test(css), 'the row layout lives in the stylesheet, where nothing can overwrite it');
  ok(/\.allow-c1\{flex:1\.3;/.test(html) && /\.allow-c2\{flex:1;/.test(html),
     'with the header and the fields sharing column widths, so a label sits over the thing it names');
}

console.log('The controls match the fields above them');
{
  const css = html.split('.allow-row select,.allow-row input{')[1].split('}')[0];
  ['border:1px solid var(--border)','border-radius:6px','padding:10px 12px','font-size:14px'].forEach(bit=>
    ok(css.indexOf(bit)>=0, 'carries the same '+bit.split(':')[0]+' as a .field control'));
  ok(/\.allow-row select:focus,\.allow-row input:focus\{border-color:var\(--olive-500\)/.test(html),
     'and the same focus colour');
}
ok(!/class="btn-secondary allow-del"/.test(html), 'the remove button no longer borrows a button style it did not fit');

console.log('A change order with no proposal behind it');
ok(/id="nc-amount"/.test(html), 'there is somewhere to say what it is worth');
ok(/NEGATIVE_OK=\['f-cost','nc-amount'\]/.test(html), 'and it takes a deduct as a negative');
{
  const sub = html.split('async function submitNewCo(){')[1].split('\n}')[0];
  ok(/const gross=set\.length \? set\.reduce\(\(s,e\)=>s\+e\.amount,0\)\s*\n?\s*: payNum\(\(document\.getElementById\('nc-amount'\)\|\|\{\}\)\.value\)/.test(sub),
     'worth what it absorbed when it covers proposals, worth what was typed when it stands alone');
  ok(/if\(!set\.length && !gross\) return say\('Give the change order an amount/.test(sub),
     'and a standalone one with no amount is refused rather than filed at zero');
}
{
  const t = html.split('function newCoTotals(){')[1].split('\n}')[0];
  ok(/const gross=set\.length \?/.test(t),
     'the running total uses the same rule, so the allowance note can tell a standalone deduct from an addition');
  ok(/el\.value=String\(gross\); el\.readOnly=true;/.test(t),
     'covering proposals fills the field and locks it — one number, one source');
  ok(/Set by the proposals covered below/.test(t), 'saying where the figure came from');
  ok(/el\.readOnly=false; el\.style\.background=''/.test(t),
     'and unticking them all hands it back rather than leaving it stuck read-only');
}

console.log('It reaches the row');
{
  const P = bootPage(); P.run(SEED);
  ok(P.run(`typeof submitNewCo==='function'`), 'the path exists');
  const sub = html.split('async function submitNewCo(){')[1].split('\n}')[0];
  ok(/row\['Cost Impact'\]=String\(gross\); row\['Approved Amount'\]=String\(gross\)/.test(sub),
     'and the amount lands on both the cost impact and the approved amount, since an issued change order is already agreed');
  ok(/row\['PCO #'\]=''/.test(sub), 'with no PCO number, because there was no proposal');
  ok(/row\['Workflow Status'\]='Complete'/.test(sub),
     'and no review chain to run on something that arrives already executed');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-standaloneco.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
