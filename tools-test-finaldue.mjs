// "Should notify us when the architect was done... that will be the indication
// to the contractor that they need to upload the finalised copy. Also, on the
// contractor home page, their Needs Attention should show Upload final
// September payment application."
//
// The last review on a pencil copy completes the chain, which is exactly when
// the panel above let the row go — so the contractor was told nothing, by a
// screen whose whole job is saying what is waiting on you.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
const R=(o)=>Object.assign({'App #':'PA #01','Contractor':'Summit Builders','Company':'Summit Builders',
  'Copy Type':'Pencil','Status':'Pencil — awaiting Fidevia','Period':'2026-09-01','Archived':''}, o);
const awaiting=(o)=>P.run(`payPencilAwaitingFinal(${JSON.stringify(R(o))})`);

console.log('Which rows are waiting on a final');
{
  ok(awaiting({'Status':'Pencil approved — awaiting final'})===true, 'an approved pencil copy is');
  ok(awaiting({'Status':'Pencil approved as noted — awaiting final'})===true,
     'and one approved as noted, since the marks are conditions on the final rather than a refusal');
  ok(awaiting()===false, 'one still being reviewed is not');
  ok(awaiting({'Status':'Pencil — awaiting Architect 2'})===false, 'nor one part-way through');
  ok(awaiting({'Status':'Revise and resubmit — awaiting contractor'})===false,
     'a pencil sent back is waiting on a corrected pencil, not on a final');
  ok(awaiting({'Status':'Pencil rejected'})===false, 'and a refused one is waiting on nothing');
  ok(P.run(`payPencilAwaitingFinal(${JSON.stringify(R({'Copy Type':'Final','Status':'Approved & Signed'}))})`)===false,
     'a final application is the thing itself, not a wait for one');
  ok(awaiting({'Status':'Pencil approved — awaiting final','Archived':'Yes'})===false,
     'and an archived row is out of the active record');
  ok(P.run(`payPencilAwaitingFinal(null)`)===false, 'no row waits for nothing');
}

console.log('What the contractor sees on their own home page');
{
  const panel=html.split('function renderAttention(')[1].split('\n}')[0];
  const block=panel.split('An approved pencil copy waiting for its formal application')[1]||'';
  ok(/if\(!payPencilAwaitingFinal\(r\)\) return;/.test(block), 'only the rows that are waiting');
  ok(/if\(!coMatches\(co\)\) return;/.test(block),
     'and only on the screen of the company whose application it is — not another contractor’s');
  ok(/upload the final application for '\+when/.test(block),
     'it asks for the thing rather than reporting a status');
  ok(/const when=payPeriodLabel\(r\['Period'\]\|\|''\)\|\|'this period';/.test(block),
     'naming the month, so "the final" is not ambiguous when two are open');
  ok(/badge:'Your upload'/.test(block),
     'badged as an upload, because it is the one item on this panel that is not a review');
  ok(/due:payDueDate\(r\)\|\|''/.test(block), 'with the date it is due by');
  ok(/sec:'payapps'/.test(block), 'and it takes you to payment applications');
}
{
  // The loop above lets a completed chain go, which is why nothing covered this.
  const panel=html.split('function renderAttention(')[1].split('\n}')[0];
  ok(/if\(wfIsDone\(r\)\) return;/.test(panel),
     'the review loop drops a finished chain — which is exactly when this begins');
  ok(panel.indexOf('payPencilAwaitingFinal') > panel.indexOf('if(wfIsDone(r)) return;'),
     'so the new rule runs after it, not instead of it');
}

console.log('And the email says what to do, not what happened');
{
  const sub=html.split('async function submitPayAction(){')[1].split('\nfunction updateContractBar')[0];
  ok(/const _finalDue = !_pending && pencil && payPencilAwaitingFinal\(row\);/.test(sub),
     'the last review on a pencil copy is recognised as the moment it is');
  ok(/every review is complete \\u2014 '\+\(row\['Contractor'\]\|\|'the contractor'\)\s*\n?\s*\+' to submit the final application'/.test(sub),
     'and the subject asks for the final application by name');
  ok(/\.concat\(_finalDue\?\[\['Next','Submit the final application for '/.test(sub),
     'with the same instruction in the body, and only when it applies');
  ok(/payPeriodLabel\(row\['Period'\]\|\|''\)\|\|'this period'/.test(sub), 'naming the month');
  ok(/\['Due',fmtDMY\(payDueDate\(row\)\|\|''\)/.test(sub), 'and the date it is due');
  ok(/const _headline=_pending[\s\S]{0,400}: \(_finalDue/.test(sub),
     'a review that is not the last one still says who it is with instead');
}
{
  // It reaches the contractor because a contractor is always on their own
  // applications, whatever the notification columns say.
  ok(/if\(mine\) return mine===theirs;/.test(html),
     'and it reaches them without anybody having ticked a box for it');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-finaldue.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
