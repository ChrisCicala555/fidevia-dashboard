// Finding yourself in the chain without reading every row.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const as = e => b.run(`EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='${e}';`);
const raw = () => b.run("wfProgressHTML('sub', allData.sub[0], 0)");
const text = () => raw().replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

// ── the step is marked, for whichever reviewer is reading ──
as('a@x.test');
ok(raw().includes('YOUR REVIEW'), 'the architect sees their own step called out');
ok(/Awaiting you and Penelope Odiem/.test(text()),
   'and the waiting line leads with them rather than burying them in a list');
as('p@y.test');
ok(raw().includes('YOUR REVIEW'), 'so does the engineer');
ok(/Awaiting you and Test Architect/.test(text()), 'with the other party named after');

// ── and not for anyone else ──
as('d@s.test');
ok(!raw().includes('YOUR REVIEW'), 'the contractor who submitted it is not marked');
ok(/Awaiting: Test Architect/.test(text()), 'and reads the plain list');
b.run("IS_ADMIN=true; EXTERNAL=false; ME_EMAIL='cc@fidevia.com';");
ok(!raw().includes('YOUR REVIEW'), 'nor is Fidevia, who is on neither step');

// ── only while it is actually waiting on them ──
as('a@x.test');
b.run("allData.sub[0]['Workflow Status']='Complete'; allData.sub[0]['Workflow Step']='1';");
ok(!raw().includes('YOUR REVIEW'), 'a finished chain marks nothing');
b.run("allData.sub[0]['Workflow Status']='Rejected'; allData.sub[0]['Workflow Step']='0';");
ok(!raw().includes('YOUR REVIEW'), 'nor does a closed one');
b.run("allData.sub[0]['Workflow Status']='In Review'; allData.sub[0]['Workflow Step']='0';");
ok(raw().includes('YOUR REVIEW'), 'and it comes back when the chain reopens on them');

// ── one rule, used everywhere ──
ok(/function wfStepIsMine\(st\)/.test(html), 'there is one test for whether a step is yours');
{
  const c = html.split('function wfMyStepsIn(steps, gs, ge)')[1].split('function wfCanAdvance')[0];
  ok(/wfStepIsMine\(steps\[n\]\)/.test(c),
     'and the group check uses it, so the highlight and the button cannot disagree about whose step it is');
}
{
  const c = html.split('const mineNow = isCur && wfStepIsMine(s);')[1].split('}).join')[0];
  ok(/border-left:3px solid var\(--olive-700\)/.test(c), 'the row itself is marked, not just labelled');
  ok(/YOUR REVIEW/.test(c), 'with a label that says what it means');
  ok(/isCur &&/.test(html.split('const mineNow =')[1].slice(0,60)),
     'and only on the step being waited on, not on one already signed');
}

console.log((bad?'FAIL':'ok  '),' tools-test-yourstep.mjs —',n,'assertions');
process.exit(bad?1:0);
