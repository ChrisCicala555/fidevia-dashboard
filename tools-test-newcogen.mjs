// "+ New CO" only ever recorded a change order somebody had written elsewhere:
// it asked for the signed document and its button said Record Change Order. So
// going in to MAKE a change order got you a form that would not make one, and
// the only generator was the button on a row that already existed — which meant
// a change order with no proposal behind it could be recorded but never drawn.
//
// It now does both, and says which one pressing the button will do.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);

console.log('The dialog says it can do both');
{
  const d = html.split('id="newco-backdrop"')[1].split('</div>\n</div>')[0];
  ok(!/For a change order written outside the dashboard/.test(d),
     'no longer describes itself as only for documents written elsewhere');
  ok(/Leave the document empty and the dashboard draws one/.test(d), 'it offers to draw one');
  ok(/upload a signed one instead if it was written elsewhere/.test(d), 'and still takes one that exists');
}
ok(/id="nc-go" onclick="submitNewCo\(\)">Record &amp; Generate</.test(html),
   'the button starts by offering to generate, which is the case somebody opening it usually wants');

console.log('And changes what it says when a document is chosen');
{
  const f = html.split('function newCoFileChanged(){')[1].split('\n}')[0];
  ok(/const has=!!\(f && f\.files && f\.files\.length\)/.test(f), 'it looks at whether a file is there');
  ok(/btn\.textContent = has \? 'Record Change Order' : 'Record & Generate'/.test(f),
     'and the button stops promising to generate once one is');
  ok(/Nothing will be drawn/.test(f), 'the hint saying so too');
}
ok(/onchange="newCoFileChanged\(\)"/.test(html), 'wired to the file input');
{
  const o = html.split('function openNewCo(){')[1].split('\n}')[0];
  ok(/\{ const f=document\.getElementById\('nc-file'\); if\(f\) f\.value=''; \}/.test(o),
     'a reopened dialog forgets the last file');
  ok(/newCoFileChanged\(\);/.test(o),
     'and the button is put back to Record & Generate rather than keeping the label from last time');
}

console.log('Recording with no document opens the generator');
{
  const sub = html.split('async function submitNewCo(){')[1].split('\n}\n')[0];
  ok(/if\(!fileId\)\{/.test(sub), 'the branch turns on whether anything was uploaded');
  ok(/const _at=rows\.length-1;/.test(sub),
     'and hands over the row just pushed, by its position in the array that was just saved');
  ok(/setTimeout\(\(\)=>\{ closeNewCo\(\); openCoGen\(_at\); \}, 700\)/.test(sub),
     'closing this dialog before opening the generator, so two modals are never stacked');
  ok(/Recorded '\+num\+'\. Opening the document/.test(sub), 'saying what is about to happen');
  // Ordering, not proximity: there is a good deal of notifying in between.
  ok(sub.indexOf('allData.co=rows;') >= 0
     && sub.indexOf('allData.co=rows;') < sub.indexOf('const _at=rows.length-1'),
     'and only after allData has been pointed at that same array — the generator reads the row from there');
}
ok(/function openCoGen\(idx\)\{/.test(html), 'the generator takes a row index, which is what it is given');
{
  // The generator refuses politely when the organisation records it needs are
  // incomplete, so being sent a fresh row cannot leave it half-drawn.
  const g = html.split('function openCoGen(idx){')[1].split('\n}')[0];
  ok(/if\(!rd\.ready\)\{/.test(g) && /Cannot generate yet/.test(g),
     'and says so rather than failing when the organisation records are not complete');
}

console.log('The two paths stay distinguishable');
ok(/>\+ New PCO</.test(html) && /onclick="openNewCo\(\)">\+ New CO</.test(html),
   'the log still offers a proposal and a change order as separate things');
{
  // Generating from an existing row is unchanged: it is the same generator,
  // reached the other way.
  ok(/event\.stopPropagation\(\);openCoGen\('\+i\+'\)/.test(html),
     'a row can still be generated from directly');
  ok((html.match(/function generateChangeOrder\(\)/g)||[]).length===1,
     'and there is exactly one implementation of the document, which is the point of routing through it');
}

console.log('Standalone still needs an amount');
{
  const sub = html.split('async function submitNewCo(){')[1].split('\n}\n')[0];
  ok(/if\(!set\.length && !gross\) return say\('Give the change order an amount/.test(sub),
     'a change order with no proposal and no amount is refused before any of this');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-newcogen.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
