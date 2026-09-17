// "5,0000" in Approved Payment Amount.
//
// Setting .value from code fires no input event, so the formatter attached to
// these fields never runs on it. Every figure a dialog filled in for you was
// left however the code happened to write it — and where one field mirrors
// another as it is typed, what got copied was the half-formatted text the
// source held for the instant before its own formatter tidied it.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
const val=id=>P.run(`document.getElementById('${id}').value`);

console.log('A figure written by code is written the way a typed one is');
{
  P.run(`setMoneyField('pa-amount', 50000)`);
  ok(val('pa-amount')==='50,000', 'a plain number is grouped');
  P.run(`setMoneyField('pa-amount', '5,0000')`);
  ok(val('pa-amount')==='50,000', 'and so is a half-formatted one, by re-deriving from the digits');
  P.run(`setMoneyField('pa-amount', '')`);
  ok(val('pa-amount')==='', 'empty stays empty');
  P.run(`setMoneyField('pa-amount', null)`);
  ok(val('pa-amount')==='', 'and so does nothing at all, rather than becoming "null"');
  P.run(`setMoneyField('pa-amount', undefined)`);
  ok(val('pa-amount')==='', 'or "undefined" — the formatter keeps only digits, and neither word has any');
  P.run(`setMoneyField('pa-amount', 1234.5)`);
  ok(val('pa-amount')==='1,234.5', 'the pennies survive');
  // On a field that allows a deduct the formatter deliberately keeps a lone
  // minus, so somebody typing -5,000 does not lose the sign at the first
  // keystroke. Written from code there is no next keystroke coming.
  P.run(`setMoneyField('pa-cos', '-')`);
  ok(val('pa-cos')==='', 'a lone minus is not a figure');
}
{
  // Which fields may go below zero is already decided; writing from code has to
  // respect the same answer as typing does.
  P.run(`setMoneyField('pa-cos', -5000)`);
  ok(val('pa-cos')==='-5,000', 'a net credit keeps its sign where the field allows one');
  P.run(`setMoneyField('pa-amount', -5000)`);
  ok(val('pa-amount')==='5,000', 'and loses it where it does not — a payment is not made backwards');
  ok(/setMoneyField[\s\S]{0,500}NEGATIVE_OK\.includes\(id\)/.test(html),
     'because it asks the same list the typed path asks');
}

console.log('Wiring tidies what is already in the field');
{
  P.run(`document.getElementById('pa-req').value='7000';
         document.getElementById('pa-req')._moneyWired=true;
         wireMoneyInputs();`);
  ok(val('pa-req')==='7,000',
     'a field already wired from an earlier open is still tidied — the dialog has new contents each time');
  P.run(`document.getElementById('pa-prev').value=''; wireMoneyInputs();`);
  ok(val('pa-prev')==='', 'an empty one is left alone rather than being given a zero');
  const w=html.split('function wireMoneyInputs(){')[1].split('\n}')[0];
  ok(/if\(String\(el\.value\|\|''\)\.trim\(\)\) fmtMoneyInput\(el,negOk\);\s*\n\s*if\(el\._moneyWired\) return;/.test(w),
     'the tidy happens before the once-only guard, the listeners after it');
}

console.log('The approved amount following the requested one')
{
  const o=html.split('function openPayAction(idx){')[1].split('\nconst PAY_MODIFY')[0];
  ok(/if\(req\) req\.oninput=function\(\)\{ payActionChanged\(\); \};/.test(o),
     'a change to the requested figure is re-derived rather than copied across');
  ok(!/a\.value=req\.value/.test(o), 'copying the text is what produced "5,0000"');
  ok(!/setMoneyField\('pa-amount'/.test(o),
     'and the amount is not filled in here at all — one place decides it, and that place is the action');
  const c=html.split('function payActionChanged(){')[1].split('\n}')[0];
  ok(/setMoneyField\('pa-amount', payReqNow\(\)\|\|''\)/.test(c),
     'which fills it as a number, not as the text the other field is mid-way through holding');
}
{
  // Denying pays nothing, and that zero is written by code too.
  ok(/if\(denied\) setMoneyField\('pa-amount','0'\);/.test(html),
     'a denial writes its zero through the same path');
}

console.log('Everywhere else a dialog fills money in for you');
{
  ok(/setMoneyField\('f-contract', m\.contract\|\|''\)/.test(html),
     'the contract pulled through when a contractor is chosen on the new application form');
  ok(/\['pa-contract','pa-cos','pa-prev','pa-req'\]\.forEach\(function\(id,i\)\{\s*\n\s*setMoneyField\(id,/.test(html),
     'and the figures a saved application is reopened with');
  ok(!/set\('pa-contract',r\['Contract Amount'\]\)/.test(html),
     'none of which go through the plain setter any more');
  // payPrefillKnown formats its own, and did from the start.
  ok(/try\{ fmtMoneyInput\(el, NEGATIVE_OK\.includes\(id\)\); \}catch\(e\)\{\}/.test(html),
     'the derived figures were already doing this, which is why they read correctly');
}
{
  const ids=JSON.parse(P.run(`JSON.stringify(MONEY_FIELDS)`));
  ok(ids.length===11 && ids.includes('pa-amount'), 'one list of money fields, used by both the wiring and the setter');
  ok(/MONEY_FIELDS\.forEach/.test(html), 'rather than the list being written out twice');
}

console.log('What was actually stored, through all of this');
{
  // Worth knowing: the saved figure was never wrong. payNum strips the commas
  // either way, so "5,0000" saved as 50000. It was the reading that was wrong,
  // and a figure you cannot read is a figure you cannot check.
  ok(P.run(`payNum('5,0000')`)===50000, 'the parser always read it as fifty thousand');
  ok(P.run(`payNum('5,000')`)===5000, 'and five thousand as five thousand');
  ok(/const amount=payNum\(document\.getElementById\('pa-amount'\)\.value\)/.test(html),
     'and that is the parser the review uses, so nothing was mis-saved');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-moneyfill.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
