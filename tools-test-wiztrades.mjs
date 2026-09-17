// "Tool here should show option to list 4 trades/contracts."
//
// A row per trade read as a company per trade — which is what "Garden Spot
// Mechanical - MC" typed into a name field was somebody working around — and a
// single dropdown could not say a firm holds two. The primes are now listed
// against the firm, each with its own contract sum, because each is its own
// agreement with the owner.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
// The harness DOM is a stub — appendChild is a no-op — so the rows are built
// here as the browser would have them and handed to the real gather. What is
// under test is how ticks become contracts, which is the part that decides the
// money; the markup is checked against the source below.
const FAKE=`
  function fakeBox(code, on, amt, label){
    var els={'.ct-on':{checked:!!on, type:'checkbox'},
             '.ct-amt':{value:amt==null?'':String(amt), disabled:!on},
             '.ct-label':(code==='Other'?{value:label||'', disabled:!on}:null)};
    return { getAttribute:function(a){ return a==='data-code'?code:null; },
             querySelector:function(sel){ return els[sel]||null; },
             querySelectorAll:function(sel){ var o=els[sel]; return o?[o]:[]; },
             classList:{toggle:function(){}} };
  }
  function fakeRow(name, boxes){
    return { querySelector:function(sel){ return sel==='.cn-name'?{value:name}:null; },
             querySelectorAll:function(sel){ return sel==='.cn-trade'?boxes:[]; } };
  }
  function useRows(rows){ document.querySelectorAll=function(sel){
    return /wiz-contractor-row/.test(sel) ? rows : []; }; }
`;
P.run(FAKE);

console.log('Every prime is listed on the firm')
{
  const m=html.split('function wizAddContractor')[1].split('function wizTradeToggle')[0];
  ok(/CONTRACTOR_ROLES\.map\(function\(r\)\{/.test(m), 'the row is built from the trade list itself');
  ok(/class="ct-on" onchange="wizTradeToggle\(this\)"/.test(m), 'each with a tick of its own');
  ok(/class="ct-amt" placeholder="1,000,000" disabled/.test(m),
     'and a contract box, shut until the trade is ticked \u2014 a sum against a prime nobody was '
     +'awarded is not a contract');
  ok(/r\[0\]==='Other'\?'<input autocomplete="off" class="ct-label"/.test(m),
     'only Other asks for a scope, since two unlabelled Others would collide');
  ok(!/class="cn-role"/.test(m) && !/class="cn-contract"/.test(m),
     'and the single dropdown is gone, which could never say a firm holds two');
  ok(/Contracts held \\u2014 tick each prime this firm was awarded/.test(m), 'with the grid headed');
  const t=html.split('function wizTradeToggle')[1].split('function wizDropContractor')[0];
  ok(/el\.disabled=!on; if\(!on\) el\.value=''/.test(t),
     'unticking empties the box as well as shutting it \u2014 a sum left behind would be saved against '
     +'nothing, or against a different contract if the trade were ticked again');
}

console.log('One firm, two primes, two contracts');
{
  P.run(`useRows([ fakeRow('Garden Spot Mechanical', [
    fakeBox('GC',false,''), fakeBox('MC',true,'500,000'), fakeBox('PC',true,'300000'),
    fakeBox('EC',false,''), fakeBox('Other',false,'') ]) ]);`);
  const lines=P.run(`wizGatherContractors()`);
  ok(lines.length===2, 'two contracts come off one firm (got '+lines.length+')');
  ok(lines.every(l=>l.name==='Garden Spot Mechanical'),
     'both under the real firm name \u2014 nobody has to write the trade into it');
  ok(lines[0].role==='MC' && lines[0].contract===500000,
     'the mechanical contract is its own, commas and all');
  ok(lines[1].role==='PC' && lines[1].contract===300000, 'and so is the plumbing one');
  ok(P.run(`wizContractorRows().length`)===1, 'while it is still one firm, not two that look like two companies');
  ok(P.run(`multiTradeNote(wizGatherContractors()).join(' ')`).indexOf('holds MC and PC')>0,
     'and it reads back as one firm holding two');
}

console.log('An unticked trade carries no contract')
{
  P.run(`useRows([ fakeRow('Garden Spot Mechanical', [
    fakeBox('MC',true,'500000'), fakeBox('PC',false,'300000') ]) ]);`);
  const lines=P.run(`wizGatherContractors()`);
  ok(lines.length===1 && lines[0].role==='MC',
     'a sum sitting in a box nobody ticked is not a contract \u2014 it is a number somebody typed and '
     +'thought better of');
}

console.log('A firm with nothing ticked is not a contract')
{
  P.run(`useRows([ fakeRow('Cook\u2019s Service Company', [fakeBox('GC',false,'')]) ]);`);
  ok(P.run(`wizGatherContractors().length`)===0, 'it contributes no contract');
  ok(P.run(`wizContractorRows().length`)===1, 'while still being a firm somebody typed in');
  // An empty row is the one the step opens with. It is not a firm, and counting
  // it as one would put "— no trade ticked" under a form nobody has touched.
  P.run(`useRows([ fakeRow('', [fakeBox('GC',false,'')]),
                   fakeRow('   ', [fakeBox('MC',true,'5000')]) ]);`);
  ok(P.run(`wizContractorRows().length`)===0, 'a blank name is not a firm, whatever is ticked on it');
  ok(P.run(`wizGatherContractors().length`)===0, 'and carries no contract');
  const c=html.split('function wizContractorNote')[1].split('\n}')[0];
  ok(/wizContractorRows\(\).filter\(r=>!r.lines.length\)/.test(c) && /no trade ticked/.test(c),
     'and is called out by name, since the flat list cannot say it \u2014 it is simply not in it');
}

console.log('An Other is its scope')
{
  P.run(`useRows([ fakeRow('Apex', [fakeBox('Other',true,'75000','Roofing')]) ]);`);
  const l=P.run(`wizGatherContractors()`)[0];
  ok(l.role==='Other' && l.label==='Roofing', 'the scope is carried, not just the code');
  ok(P.run('tradeKeyOf('+JSON.stringify(l)+')')==='OC:ROOFING', 'which is what keeps two of them apart');
}

console.log('A draft comes back grouped as it was entered')
{
  const r=html.split('function wizRestoreState')[1].split('function wizAddContact')[0];
  ok(/let g=byName\.find\(x=>coNorm\(x\.name\)===coNorm\(nm\)\);/.test(r),
     'the flat contracts in a draft are grouped by firm on the way back in');
  ok(/if\(cb\)\{ cb\.checked=true; wizTradeToggle\(cb\); \}/.test(r),
     'ticking each prime through the same handler, so the boxes open the way they would by hand');
  ok(/amt\.value=\(c\.contract==null\?'':c\.contract\)/.test(r), 'and each sum lands on its own trade');
}

console.log('An allowance belongs to a contract, not to a firm');
{
  ok(/function alwLineKey\(c\)\{ return alwKey\(String\(\(c&&c\.name\)\|\|''\)\+' '\+tradeKeyOf\(c\)\); \}/.test(html),
     'so the boxes are keyed on the contract');
  ok(!/prefix\+'-alw-'\+alwKey\(c\.name\)/.test(html),
     'and not on the company, where one firm holding two primes had a single set for both and '
     +'whichever rendered last owned them');
  ok(/out\[alwLineKey\(c\)\]=/.test(html), 'gathered back under the same key');
}

console.log(bad ? `FAIL tools-test-wiztrades.mjs — ${bad} of ${n}` : `ok   tools-test-wiztrades.mjs — ${n} assertions`);
process.exit(bad?1:0);
