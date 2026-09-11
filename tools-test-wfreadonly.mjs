// An architect may read Workflow Settings and nothing else — that is what the
// ae-readonly class on the nav item has always meant. The page still offered
// them a remove button on every step, an Add Step button and a Save button, all
// of which the server would refuse. A control that cannot work is worse than no
// control: it invites the click and then explains itself as an error.
//
// There was a wf-edit class in the stylesheet for exactly this, and nothing in
// the markup ever carried it, so the rule had never applied to anything.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);
const asFidevia   = () => R(`IS_ADMIN=true; document.body.classList.remove('external-mode');`);
const asViewingAE = () => R(`IS_ADMIN=true; document.body.classList.add('external-mode');`);
const asArchitect = () => R(`IS_ADMIN=false; document.body.classList.remove('external-mode');`);
const row  = () => R(`wfStepRow('wfs','rfi','Architect Review','Test Architect',true,false)`);
const block= () => R(`wfBlock('wfs','rfi','RFIs',[])`);

console.log('Who may edit');
asFidevia();   ok(R(`wfMayEditSettings()`)===true,  'Fidevia may');
asArchitect(); ok(R(`wfMayEditSettings()`)===false, 'an architect may not');
asViewingAE(); ok(R(`wfMayEditSettings()`)===false,
  'and neither may Fidevia while looking at the project as somebody else — what is on screen is what that person would see');

console.log('What a reader gets');
asArchitect();
{
  const h=row();
  ok(!/×<\/button>/.test(h) && !/\\u00d7<\/button>/.test(h),
     'no remove button — left out rather than hidden, since a rule can be overridden and an element never rendered cannot');
  ok(/class="wf-name"[^>]*readonly/.test(h), 'the step name cannot be typed into');
  ok(/class="wf-person"[^>]*readonly/.test(h), 'nor the assignee');
  ok(/class="wf-par"[^>]*disabled/.test(h), 'the parallel box cannot be ticked');
  ok((h.match(/disabled/g)||[]).length>=2, 'and neither can all-must-sign');
  ok(/Architect Review/.test(h) && /Test Architect/.test(h),
     'while the chain itself still reads — the point is to show it, not to hide it');
}
ok(!/\+ Add Step/.test(block()), 'no Add Step');

console.log('What Fidevia gets');
asFidevia();
{
  const h=row();
  ok(/×<\/button>|\\u00d7<\/button>/.test(h), 'the remove button is back');
  ok(!/class="wf-name"[^>]*readonly/.test(h), 'the step name is editable');
  ok(!/class="wf-par"[^>]*disabled/.test(h), 'and the boxes tick');
  ok(/class="wf-co"[^>]*readonly/.test(h),
     'except Company, which was always derived from the assignee and readonly for everyone');
}
ok(/\+ Add Step/.test(block()), 'and Add Step is there');

console.log('The buttons below the list');
{
  const f = html.split('function loadWorkflowSettings(){')[1].split('\n}')[0];
  ok(/\['btn-wf-save','btn-wf-revert'\]\.forEach/.test(f), 'save and revert are decided by the same rule');
  ok(/if\(!ed\) b\.style\.display='none'/.test(f), 'and hidden from a reader');
  ok(/else if\(id==='btn-wf-save'\) b\.style\.display=''/.test(f),
     'while Fidevia gets Save back — hiding it must not be one-way when the same page is reused');
  ok(/It is set by Fidevia \\u2014 you can see it here, but not change it/.test(f),
     'and the reader is told why, rather than left wondering where the button went');
}
{
  // Revert is only meaningful on a company override, so Fidevia's revert keeps
  // its own show/hide logic rather than being forced visible.
  const f = html.split('function loadWorkflowSettings(){')[1].split('\n}')[0];
  ok(!/id==='btn-wf-revert'\) b\.style\.display=''/.test(f),
     'revert is not forced back on, since it belongs to a company override rather than to the default chain');
}

console.log('The dead class is alive');
ok(/class="btn-secondary wf-edit"/.test(html),
   'wf-edit is on the controls the stylesheet has always tried to hide');
ok(/body\.role-ae \.wf-edit/.test(html), 'and the rule that hides it is still there as a second line of defence');

console.log('The server is still the one that decides');
{
  const srv = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
  ok(/op === 'uploadText'/.test(srv), 'settings are written through a guarded op');
  ok(/who\.isAdmin/.test(srv), 'which checks who is asking');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-wfreadonly.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
