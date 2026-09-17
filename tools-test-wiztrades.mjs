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
  function fakeRow(name, boxes, active){
    return { querySelector:function(sel){
               if(sel==='.cn-name') return {value:name};
               if(sel==='.ce-active') return {value:(active===false?'0':'1')};
               return null; },
             querySelectorAll:function(sel){
               if(sel==='.cn-trade') return boxes;
               if(sel==='.ct-on') return boxes.map(function(b){ return b.querySelector('.ct-on'); });
               return []; } };
  }
  function useRows(rows){ document.querySelectorAll=function(sel){
    return /wiz-contractor-row|contr-edit-row/.test(sel) ? rows : []; }; }
`;
P.run(FAKE);

console.log('Every prime is listed on the firm')
{
  const m=html.split('function wizAddContractor')[1].split('function wizTradeToggle')[0];
  ok(/CONTRACTOR_ROLES\.map\(function\(r\)\{/.test(m), 'the row is built from the trade list itself');
  ok(/class="ct-on" onchange="wizTradeToggle\(this\)"/.test(m), 'each with a tick of its own');
  ok(/class="ct-amt" placeholder="e\.g\. 1,000,000" disabled/.test(m),
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

console.log('The row is a card, not a flex strip')
{
  // Left with the old inline display:flex, the whole grid laid out sideways:
  // the name field, the heading and every trade in one line, each squeezed to
  // nothing. Nothing on it could be read, let alone ticked.
  const w=html.split('function wizAddContractor')[1].split('function wizTradeToggle')[0];
  ok(!/div\.style='display:flex/.test(w),
     'the wizard row carries no inline flex \u2014 that is what turned the grid on its side');
  ok(/div\.className='wiz-contractor-row';/.test(w), 'it is styled by class');
  const e=html.split('function addContractorEditRow')[1].split('function ceRows')[0];
  ok(!/div\.style=/.test(e), 'nor does the editor row');
  ok(/\.wiz-contractor-row\{display:block;/.test(html),
     'and the class says block, so the trades stack the way a list of contracts should');
  ok(/\.cn-trade\{display:flex;/.test(html), 'while each trade line is the flex one \u2014 tick, code, name, sum');
}

console.log('Manage Contractors asks the same question')
{
  const e=html.split('function addContractorEditRow')[1].split('function ceRows')[0];
  ok(/CONTRACTOR_ROLES\.map\(function\(r\)\{/.test(e) && /class="ct-on"/.test(e),
     'the live editor lists the primes against the firm, the way the wizard does');
  ok(/class="cn-name"/.test(e) && !/class="ce-name"/.test(e),
     'one name field for the firm, not one per contract');
  ok(/onchange="wizTradeToggle\(this\)"/.test(e),
     'and shares the wizard\u2019s handler, so the two editors cannot behave differently');
  ok(/class="ct-alw"/.test(e) && /allowance/.test(e),
     'each prime says how many allowances sit inside it, so nobody retires one without seeing what '
     +'goes with it');
  const r=html.split('function renderContractorsEditor')[1].split('function addContractorEditRow')[0];
  ok(/let g=byName\.find\(x=>coNorm\(x\.name\)===coNorm\(nm\)\);/.test(r),
     'existing contracts group back into firms on the way in');
  ok(/c\.active===false/.test(r),
     'and a deactivated contract is still listed, since this is where it would be brought back');
  const g=html.split('function ceRows')[1].split('function ceFirms')[0];
  ok(/tradeKeyOf/.test(html.split('async function saveContractors')[1].split('const dupes')[0]),
     'and what is saved carries allowances forward by contract, not by company');
  ok(/active:active/.test(g), 'the firm\u2019s status applies to every contract it holds');
}

console.log('And the live editor gathers the same way')
{
  P.run(`useRows([ fakeRow('Garden Spot Mechanical', [
    fakeBox('GC',false,'999999'), fakeBox('MC',true,'500,000'), fakeBox('PC',true,'300000') ]) ]);`);
  const lines=P.run(`ceRows()`);
  ok(lines.length===2, 'two contracts off one firm (got '+lines.length+')');
  ok(!lines.some(l=>l.role==='GC'),
     'and a sum sitting under a prime nobody ticked is not one of them \u2014 it is a number somebody '
     +'typed and thought better of');
  ok(lines[0].contract===500000 && lines[1].contract===300000, 'each carrying its own sum');
  ok(lines.every(l=>l.active===true), 'active by default');
  P.run(`useRows([ fakeRow('Garden Spot Mechanical', [fakeBox('MC',true,'500000')], false) ]);`);
  ok(P.run(`ceRows()`)[0].active===false,
     'and the firm\u2019s status carries to every contract it holds, since a firm is off the job or on it');
  // The empty row the panel opens with is not a firm, and reporting it would put
  // "— no trade ticked" under a panel nobody has touched.
  P.run(`useRows([ fakeRow('', [fakeBox('GC',false,'')]) ]);`);
  ok(P.run(`ceFirms().length`)===0, 'a blank row is not a firm');
  P.run(`useRows([ fakeRow('Cook\u2019s Service Company', [fakeBox('GC',false,'')]) ]);`);
  ok(P.run(`ceRows().length`)===0 && P.run(`ceFirms()[0].ticked`)===0,
     'a firm with nothing ticked holds no contract, and is still reported as a firm so the save can '
     +'stop on it');
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
