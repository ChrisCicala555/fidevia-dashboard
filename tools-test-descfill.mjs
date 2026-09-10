// Ticking a proposal fills the change order's description from it. The change
// order is describing that work, so retyping it is both a waste and a chance
// for the two records to disagree about the same change.
//
// The hard part is not the filling, it is knowing when to stop: an autofill
// that overwrites what somebody wrote is worse than no autofill at all.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);

console.log('What it fills with');
ok(R(`newCoDescFrom([{row:{'Description':'Additional communication wire'}}])`)
   ==='Additional communication wire', 'one proposal, its own words');
ok(R(`newCoDescFrom([{row:{'Description':'Wire'}},{row:{'Description':'Bigger building'}}])`)
   ==='Wire; Bigger building',
   'several are joined, so a change order covering three says what all three were');
ok(R(`newCoDescFrom([])`)==='', 'nothing ticked, nothing written');
ok(R(`newCoDescFrom([{row:{'Description':'  Wire  '}},{row:{}},{row:{'Description':''}}])`)==='Wire',
   'a proposal with no description of its own is skipped rather than leaving a stray separator');
ok(R(`newCoDescFrom(null)`)==='', 'and an absent set is not an error');

console.log('When it stops');
{
  const d = html.split('function newCoDescTyped(){')[1].split('\n}')[0];
  ok(/NC_DESC_AUTO = !el \|\| !String\(el\.value\|\|''\)\.trim\(\)/.test(d),
     'typing anything hands control to the person typing');
  ok(/!String\(el\.value\|\|''\)\.trim\(\)/.test(d),
     'and clearing the field hands it back, so the autofill is recoverable rather than one-way');
}
ok(/oninput="newCoDescTyped\(\)"/.test(html), 'wired to the description field');
{
  const t = html.split('function newCoTotals(){')[1].split('\n}')[0];
  ok(/if\(d && NC_DESC_AUTO\) d\.value=newCoDescFrom\(set\)/.test(t),
     'and the fill only happens while nobody has taken it over');
}
{
  const o = html.split('function openNewCo(){')[1].split('\n}')[0];
  ok(/NC_DESC_AUTO=true;/.test(o),
     'a reopened dialog fills again — the last person’s typing does not disable it forever');
}

console.log('Driving it');
{
  R(`NC_DESC_AUTO=true; const d=document.getElementById('nc-desc'); d.value='';`);
  R(`document.getElementById('nc-desc').value=newCoDescFrom([{row:{'Description':'Wire'}}]);`);
  ok(R(`document.getElementById('nc-desc').value`)==='Wire', 'ticking one writes its description');
  // Somebody types over it.
  R(`document.getElementById('nc-desc').value='My own wording'; newCoDescTyped();`);
  ok(R(`NC_DESC_AUTO`)===false, 'typing turns the autofill off');
  // Clearing it hands control back.
  R(`document.getElementById('nc-desc').value=''; newCoDescTyped();`);
  ok(R(`NC_DESC_AUTO`)===true, 'clearing it turns the autofill back on');
  R(`document.getElementById('nc-desc').value='   '; newCoDescTyped();`);
  ok(R(`NC_DESC_AUTO`)===true, 'and whitespace counts as clear, not as wording');
}

console.log('The description is still required');
{
  const sub = html.split('async function submitNewCo(){')[1].split('\n}\n')[0];
  ok(/if\(!desc\) return say\('Give the change order a description/.test(sub),
     'an untouched, unticked dialog is still refused rather than filing a nameless change order');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-descfill.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
