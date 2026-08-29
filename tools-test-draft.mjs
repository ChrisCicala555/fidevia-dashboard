// Pausing and resuming a project setup.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ── server ──
for (const op of ['listDrafts','getDraft','saveDraft','deleteDraft']) {
  ok(new RegExp("op === '"+op+"'").test(srv), op+' exists');
  const blk = srv.split("if (op === '"+op+"')")[1].slice(0, 700);
  ok(/who\.isAdmin/.test(blk), op+' is admin-only');
}
ok(/const draftStore = \(\) => getStore\('project-drafts'\)/.test(srv), 'drafts have their own store');
{
  const sv = srv.split("if (op === 'saveDraft')")[1].split("if (op === 'deleteDraft')")[0];
  ok(/String\(body\.id \|\| ''\)\.trim\(\) \|\| \('d' \+ Date/.test(sv),
     'saving reuses the id when there is one, so a draft is updated rather than duplicated');
  ok(/by: who\.email/.test(sv), 'the draft records who was working on it');
  ok(/at: new Date\(\)\.toISOString\(\)/.test(sv), 'and when');
  ok(/body\.state && typeof body\.state === 'object'/.test(sv), 'the state is stored as given');
  ok(!/np-name|contacts:|milestones:/.test(sv),
     'the server does not know the wizard field layout, so a wizard change cannot invalidate a draft');
}
{
  const g = srv.split("if (op === 'getDraft')")[1].split("if (op === 'saveDraft')")[0];
  ok(/404/.test(g) && /no longer there/.test(g), 'a draft someone else finished reports plainly');
}
{
  const l = srv.split("if (op === 'listDrafts')")[1].split("if (op === 'getDraft')")[0];
  ok(/out\.sort/.test(l) && /b\.at.*a\.at|String\(b\.at\)/.test(l), 'most recent first');
  ok(!/state/.test(l), 'the list does not ship every draft in full');
}

// ── capture and restore go through the same gatherers as creation ──
ok(/function wizCaptureState/.test(html) && /function wizRestoreState/.test(html), 'capture and restore exist');
const cap = html.split('function wizCaptureState')[1].split('function wizRestoreState')[0];
for (const g of ['wizGatherContacts()','wizGatherContractors()','wizGatherMilestones()',"wfGather('npwf')"]) {
  ok(cap.includes(g), 'capture reuses '+g+', so a draft matches what would be built');
}
ok(/logo is deliberately not kept/.test(cap), 'the unrestorable file input is called out rather than silently dropped');
const res = html.split('function wizRestoreState')[1].split('async function wizSaveDraft')[0];
ok(/wizAddContact\(\)/.test(res) && /wizAddContractor\(\)/.test(res), 'rows are rebuilt through the normal builders');
ok(/renderWizMilestones/.test(res) && /wfRenderAll/.test(res), 'milestones and workflows are restored');
ok(/st\.invite!==false/.test(res), 'the invite checkbox defaults to on, as it does for a new project');
ok(/\[null\]/.test(res), 'an empty draft still gets one blank row rather than none');

// ── the wizard ──
ok(/id="wiz-draft" onclick="wizSaveDraft\(event\)"/.test(html), 'Save & Close is in the footer');
const sd = html.split('async function wizSaveDraft')[1].split('function wizCancel')[0];
ok(/if\(!name\)/.test(sd), 'a draft needs a name to be recognisable');
ok(/step:WIZ_STEP/.test(sd), 'the step is saved so you come back where you left off');
ok(/WIZ_DRAFT_ID=d\.id/.test(sd), 'the id is kept, so saving twice updates one draft');
const cn = html.split('function wizCancel')[1].split('async function resumeDraft')[0];
ok(/confirm\(/.test(cn) && /Save & Close/.test(cn), 'cancelling warns and points at the alternative');
ok(/touched/.test(cn), 'an untouched wizard closes without nagging');
const rd = html.split('async function resumeDraft')[1].split('async function discardDraft')[0];
ok(/wizGo\(WIZ_STEP\)/.test(rd), 'resuming lands on the step it was left at');
ok(/WIZ_DRAFT_ID=id/.test(rd), 'resuming adopts the id so finishing clears the right draft');
ok(rd.indexOf('initWizard()') < rd.indexOf('wizRestoreState'),
   'the wizard is cleared before the draft is written into it');
ok(/WIZ_DRAFT_ID=''; initWizard\(\)/.test(html), 'starting fresh does not inherit the last draft id');

// ── finishing clears the draft ──
{
  const cp = html.split('async function createProject')[1];
  ok(/if\(WIZ_DRAFT_ID\)\{ try\{ await proxyCall\('deleteDraft'/.test(cp), 'creating removes the draft');
  ok(cp.indexOf('writeProjectConfig(projId, config)') < cp.indexOf("deleteDraft"),
     'the draft is only removed once the project is written');
}

// ── the picker ──
ok(/let PICKER_DRAFTS=\[\]/.test(html), 'drafts have their own list');
ok(/IS_ADMIN && !EXTERNAL && !archivedView/.test(html), 'drafts show to Fidevia only, and not in the archived view');
ok(/catch\(e\)\{ PICKER_DRAFTS=\[\]; \}/.test(html), 'a failed draft list does not stop real projects loading');
ok(/draft-card/.test(html) && /border-style:dashed/.test(html), 'a draft card reads as unfinished');
ok(/Being built/.test(html), 'it is labelled');
ok(/Resume setup/.test(html), 'and says what clicking does');
ok(/Step '\+\(d\.step\|\|1\)\+' of 6/.test(html), 'it shows how far the setup got');
ok(/discardDraft/.test(html), 'a draft can be discarded');
{
  const dd = html.split('async function discardDraft')[1].slice(0,500);
  ok(/Nothing has been created yet/.test(dd), 'discarding says what is and is not lost');
}
ok(/PICKER_DRAFTS = \[\]/.test(html.split('EXTERNAL){')[1].slice(0,600)) ||
   /PICKER_ARCHIVED = new Set\(\); PICKER_DRAFTS = \[\]/.test(html),
   'external users are never given drafts');

console.log((bad?'FAIL ':'ok   ')+'tools-test-draft.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
