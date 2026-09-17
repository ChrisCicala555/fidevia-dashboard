// "If it doesn't see a pencil copy for the period, it should warn you from
// uploading the final copy."
//
// The order is a pencil copy, marked up by Fidevia and the architect, then the
// formal application built on what came back. A final filed straight into a
// month with nothing behind it has skipped the conversation the pencil copy
// exists to have — or there is a pencil sitting right there and this is about
// to become a second application for one billing period.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`EXTERNAL=true; IS_ADMIN=false;
  viewingAsExternal=function(){ return true; };
  viewingAsCompany=function(){ return 'Summit Builders'; };`);
const R=(o)=>Object.assign({'App #':'PA #01','Contractor':'Summit Builders','Company':'Summit Builders',
  'Copy Type':'Pencil','Status':'Pencil — awaiting Fidevia','Period':'2026-09-01',
  'Attachment File ID':'a','Attachment Name':'p.pdf'}, o);
const set=a=>P.run(`allData.pay_apps=${JSON.stringify(a)};`);
const warn=(period)=>P.run(`payFinalWarning('Summit Builders',${JSON.stringify(period||'2026-09-01')})`);

console.log('Nothing on record for the month');
{
  set([]);
  const w=warn();
  ok(w && w.kind==='nopencil', 'a final with no pencil behind it is worth saying something about');
  ok(/No pencil copy on record for September 2026\./.test(w.text), 'naming the month, not "this period"');
  ok(/pencil copy first, for Fidevia and the architect to mark up/.test(w.text),
     'and saying what the order is meant to be, since that is the thing being skipped');
}
{
  // Another month, another contractor: neither stands in for this one.
  set([R({'Period':'2026-08-01'})]);
  ok(warn().kind==='nopencil', "last month's pencil copy is not this month's");
  set([R({'Contractor':'Delaney Mechanical','Company':'Delaney Mechanical'})]);
  ok(warn().kind==='nopencil', "and another contractor's is not theirs");
  set([R({'Period':'2026-09-30'})]);
  ok(warn().kind==='promote',
     'but a pencil anywhere in the same month is this month\u2019s, since the period is the month');
}

console.log('A pencil copy sitting there is the one to carry forward');
{
  set([R()]);
  const w=warn();
  ok(w && w.kind==='promote', 'filing a second document alongside it is the mistake worth catching');
  ok(/Use Submit Final on that row instead/.test(w.text), 'and there is a button that does it properly');
  ok(/second application for one billing period/.test(w.text), 'saying what goes wrong otherwise');
}
{
  // Reviewed and approved, so Submit Final is the path; still promote.
  set([R({'Status':'Pencil approved — awaiting final'})]);
  ok(warn().kind==='promote', 'an approved pencil is exactly the one to submit the final against');
  // Sent back or refused: Submit Final is closed, so pointing at it would be wrong.
  set([R({'Status':'Revise and resubmit — awaiting contractor'})]);
  ok(warn()===null, 'a pencil sent back is neither a reason to skip nor a row to promote');
  set([R({'Status':'Pencil rejected'})]);
  ok(warn()===null, 'and a refused one is not either');
}

console.log('A final already filed for the month');
{
  set([R({'Copy Type':'Final','Status':'Uploaded — awaiting Fidevia'})]);
  const w=warn();
  ok(w && w.kind==='duplicate', 'a second final for one period is worth catching on its own');
  ok(/A final application for September 2026 is already on record\./.test(w.text), 'and says so plainly');
  set([R(), R({'App #':'PA #02','Copy Type':'Final','Status':'Uploaded — awaiting Fidevia'})]);
  ok(warn().kind==='promote', 'with an open pencil as well, the pencil is the more useful thing to say');
}

console.log('Nothing to say without something to say it about');
{
  set([]);
  ok(P.run(`payFinalWarning('Summit Builders','')`)===null, 'no period chosen, no warning');
  ok(P.run(`payFinalWarning('','2026-09-01')`)===null, 'no company, no warning');
}

console.log('Where it appears');
{
  ok(/id="f-copytype-warn"/.test(html), 'under the pencil-or-final choice');
  const f=html.split('function payFinalWarnNote(){')[1].split('\nfunction fileToB64')[0];
  ok(/segValue\('f-copytype'\)==='Final'/.test(f), 'only when a final is what is being filed');
  ok(/color:#8a5a00;font-weight:600;/.test(f), 'marked, rather than in the same grey as the guidance');
  ok(/el\.innerHTML = w[\s\S]{0,200}: '';/.test(f), 'and cleared when there is nothing to say');
  ok(/try\{ payFinalWarnNote\(\); \}catch\(e\)\{\}/.test(html.split('function copyTypeNote(){')[1].split('\n}')[0]),
     'redrawn when the choice changes');
  ok((html.match(/try\{ payFinalWarnNote\(\); \}catch\(e\)\{\}/g)||[]).length>=2,
     'and when the billing period does, since the answer depends on the month');
}

console.log('And it is asked before the document goes');
{
  const sub=html.split("const _copy = segValue('f-copytype')")[1].split('PRE_NUM already asked Box')[0];
  ok(/if\(_copy==='Final'\)\{/.test(sub), 'only on a final');
  ok(/const _w=payFinalWarning\(_comp, _period\);/.test(sub), 'the same rule the form showed');
  ok(/if\(_w && !confirm\(_w\.text\+'\\n\\nFile this final application anyway\?'\)\)\s*\n\s*throw new Error\('Cancelled\.'\);/.test(sub),
     'asked once rather than refused — a first month, or a contract with no pencil stage, is a fair reason');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-nopencil.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
