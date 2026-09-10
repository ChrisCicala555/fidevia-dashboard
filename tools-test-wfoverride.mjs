// Fidevia standing in for a reviewer who answered off the record — an architect
// rings to say they are content, a signed page arrives by post. A real thing to
// need, and it half-existed: wfAdvance would record somebody else's approval
// through a confirm() and a numbered prompt, with no choice of outcome and
// nowhere to say why.
//
// The reason is the part that matters afterwards. A tick beside a reviewer's
// name that they did not put there needs to explain itself on the row, not only
// in an audit log somebody has to go and find.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);
R(`currentProject.config.workflows.co=[
   {name:'Fidevia Review',person:'Christopher Cicala',email:'cc@fidevia.com',company:'Fidevia'},
   {name:'Architect Review',person:'Test Architect',email:'a@x.test',company:'Architect 2',parallel:true}];`);
const ROW = `{'PCO #':'PCO-GC-001','Company':'Summit Builders','Workflow Step':'0','Workflow Status':'In Review',
  'Workflow Signed':JSON.stringify({'0':{by:'cc@fidevia.com',at:'2026-09-10'}})}`;

console.log('Who may, and on which step');
R(`IS_ADMIN=true; VIEW_AS=null; EXTERNAL=false;`);
ok(R(`wfMayOverride()`)===true, 'Fidevia may');
R(`IS_ADMIN=false`); ok(R(`wfMayOverride()`)===false, 'a contractor may not');
// viewingAsExternal reads the body class the viewer switch sets, so that is
// what the test flips — VIEW_AS alone would not reproduce it.
R(`IS_ADMIN=true; document.body.classList.add('external-mode');`);
ok(R(`wfMayOverride()`)===false, 'and neither may Fidevia while looking at the project as somebody else');
R(`document.body.classList.remove('external-mode');`);
ok(R(`wfMayOverride()`)===true, 'switching back restores it');
ok(JSON.parse(R(`JSON.stringify(wfOverridableSteps('co',${ROW}))`)).join()==='1',
   'only the step in this group that nobody has answered — step 0 is already signed');
{
  const both = `{'PCO #':'P2','Company':'Summit Builders','Workflow Step':'0','Workflow Status':'In Review'}`;
  ok(JSON.parse(R(`JSON.stringify(wfOverridableSteps('co',${both}))`)).join()==='0,1',
     'both when neither has');
  const doneList = `{'PCO #':'P3','Company':'Summit Builders','Workflow Step':'0','Workflow Status':'In Review',
    'Workflow Done':JSON.stringify([0])}`;
  ok(JSON.parse(R(`JSON.stringify(wfOverridableSteps('co',${doneList}))`)).join()==='1',
     'and a step already marked done in a must-sign group is not offered again');
}
{
  const stopped = `{'PCO #':'P4','Company':'Summit Builders','Workflow Step':'0','Workflow Status':'Rejected'}`;
  ok(R(`wfOverridableSteps('co',${stopped}).length`)===0, 'nothing on an item that has been decided against');
  const done = `{'PCO #':'P5','Company':'Summit Builders','Workflow Step':'1','Workflow Status':'Complete'}`;
  ok(R(`wfOverridableSteps('co',${done}).length`)===0, 'nor on a finished one');
}
{
  // A later step is not offered: overriding it would jump the queue.
  R(`currentProject.config.workflows.co=currentProject.config.workflows.co.concat([{name:'Owner Sign',person:'Sophie Hinkle',company:'Ithaca'}]);`);
  ok(JSON.parse(R(`JSON.stringify(wfOverridableSteps('co',${ROW}))`)).indexOf(2)<0,
     'a step the item has not reached yet is not offered');
  R(`currentProject.config.workflows.co=currentProject.config.workflows.co.slice(0,2);`);
}

console.log('The reason is kept with the step');
{
  R(`ROW2={}; wfMarkSigned(ROW2, 1, 'Christopher Cicala (override)', true, 'Approved', '', 'Confirmed by phone with Dana on 10 Sep');`);
  const sig=JSON.parse(R(`JSON.stringify(wfSignedMap(ROW2)['1'])`));
  ok(sig.override===true, 'marked as an override');
  ok(sig.reason==='Confirmed by phone with Dana on 10 Sep', 'with the reason on the signature itself');
  ok(sig.by==='Christopher Cicala (override)', 'and who entered it');
  R(`ROW3={}; wfMarkSigned(ROW3, 0, 'x', false, 'Approved', '', '   ');`);
  ok(R(`wfSignedMap(ROW3)['0'].reason===undefined`), 'and a blank reason adds no empty field');
}

console.log('It shows on the row, not only in the log');
{
  const w = html.split('function wfProgressHTML')[1].split('\n}')[0];
  ok(/Override by '\+esc\(String\(sig\.by\|\|'Fidevia'\)\.replace\(/.test(w),
     'the row says who entered it');
  ok(/esc\(String\(sig\.reason\)\)/.test(w), 'and why');
  ok(/\.replace\(\/\\s\*\\\(override\\\)\$\/,''\)/.test(w),
     'without repeating the word override, which the pill beside it already says');
  ok(/canOv\.indexOf\(n\)>=0/.test(w), 'and the control appears only on a step that may be overridden');
  ok(/event\.stopPropagation\(\);openWfOverride\(/.test(w),
     'with the click held back from the row underneath, which would otherwise fold the thread');
}
{
  // This assertion used to check only that the call appeared in the source,
  // which it did — inside an onclick attribute that JSON.stringify had already
  // broken by putting DOUBLE quotes round the key. The button rendered and did
  // nothing. So the check is now on the rendered markup.
  const P2 = bootPage(); P2.run(SEED);
  P2.run(`currentProject.config.workflows.co=[
    {name:'Fidevia Review',person:'Christopher Cicala',email:'cc@fidevia.com',company:'Fidevia'},
    {name:'Architect Review',person:'Test Architect',email:'a@x.test',company:'Architect 2',parallel:true}];
    IS_ADMIN=true;`);
  const out = P2.run(`wfProgressHTML('co',{'PCO #':'PCO-GC-001','Company':'Summit Builders',
    'Workflow Step':'0','Workflow Status':'In Review',
    'Workflow Signed':JSON.stringify({'0':{by:'cc@fidevia.com',at:'2026-09-10'}})},0)`);
  const btn = (out.match(/<button class="wf-ov"[^>]*>/)||[''])[0];
  ok(btn.length>0, 'the button renders');
  ok(/onclick="event\.stopPropagation\(\);openWfOverride\('co',0,1\)"/.test(btn),
     'and its onclick survives into the attribute intact, arguments and all');
  ok((btn.match(/"/g)||[]).length % 2 === 0,
     'with balanced quotes — an odd one closes the attribute early and truncates the handler');
}

console.log('What the dialog insists on');
{
  const d = html.split('async function submitWfOverride(){')[1].split('\n}')[0];
  ok(/if\(!reason\)\{/.test(d), 'a reason is required');
  ok(/cannot say why/.test(d), 'and says why it is required, rather than just refusing');
  ok(/await wfAdvance\(key, i, \{stepIdx:n, outcome, reason\}\)/.test(d), 'then records it');
}
ok(/A reason is required\./.test(html.split('async function wfAdvance')[1]),
   'and the write path checks again — a dialog is not a guarantee');
{
  const a = html.split('async function wfAdvance')[1];
  ok(/if\(!IS_ADMIN \|\| viewingAsExternal\(\)\) return;/.test(a), 'so does the permission');
  ok(/if\(!\(ov\.stepIdx>=gs && ov\.stepIdx<=ge\)\) throw new Error/.test(a),
     'and that the step is the one the item is actually on');
  ok(/if\(_sg\[String\(ov\.stepIdx\)\]\) throw new Error/.test(a),
     'and that nobody has answered it since the page was drawn — overwriting a real answer with an override is the worst thing this could do');
}

console.log('A rejection stops the item');
{
  const a = html.split('async function wfAdvance')[1];
  ok(/if\(override && ov && DECIDED_AGAINST\.test\(String\(ov\.outcome\|\|''\)\)\)\{/.test(a),
     'an override that says no is recognised');
  ok(/wfApplyDecision\(key, row, String\(ov\.outcome\)/.test(a), 'and closes the chain');
  ok(/row\['Status'\]=String\(ov\.outcome\);/.test(a), 'setting the item’s own status too');
  const branch = a.split('if(override && ov && DECIDED_AGAINST')[1].split('if(needsAll){')[0];
  ok(/return;/.test(branch), 'and stops there rather than advancing past a refusal');
  ok(/\['Reason', String\(ov\.reason\|\|''\)\]/.test(branch),
     'the notification carrying the reason, so the reviewer who did not enter it can see what was recorded for them');
  ok(/\['Entered by', \(ME_NAME\|\|ME_EMAIL\|\|'Fidevia'\)\+' \\u2014 override'\]/.test(branch),
     'and that it was an override');
}
ok(/JSON.stringify\(WFOV_OUTCOMES\)|const WFOV_OUTCOMES=\['Approved','Rejected'\]/.test(html),
   'only approve and reject are offered');
ok(/Sending it back for revision is not here/.test(html),
   'and the dialog says why sending it back is not — that path has to remember who raised the objection, which only the reviewer can say');

console.log('The audit log says what happened');
{
  const a = html.split("auditLog('Workflow override'")[1].split('}catch(e){} }')[0];
  ok(/on their behalf/.test(a), 'that it was on somebody’s behalf');
  ok(/\+\(ov&&ov\.outcome\?\(' as '\+String\(ov\.outcome\)\):''\)/.test(a), 'what was recorded');
  ok(/\+\(ov&&ov\.reason\?\(' \\u2014 '\+String\(ov\.reason\)\):''\)/.test(a), 'and why');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-wfoverride.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
