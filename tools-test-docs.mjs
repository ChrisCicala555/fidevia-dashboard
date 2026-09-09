// Documents became a live folder browser over Box. The rule that matters: every
// external party is confined to the folder named for their company — including
// the architect and engineer, who see everything else on the project.
import fs from 'fs';
const proxy=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(s,sig)=>{ const i=s.indexOf(sig); let d=0,on=false,j=i;
  for(;j<s.length;j++){ if(s[j]==='{'){d++;on=true;} else if(s[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return s.slice(i,j); };

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

console.log('Permission');
const al=grab(proxy,'async function docsAllows');
ok('admins see everything',            /if \(who\.isAdmin\) return true;/.test(al));
ok('outside Documents it declines',    /if \(!pos\) return false;/.test(al));
// Documents is the shared record of the job now, not a folder per firm, so
// there is no company test to exempt anyone from. What is left is: you hold a
// grant on this project, and the folder is not Confidential.
ok('a caller with no grant is refused', /if \(!g\) return false;/.test(al));
ok('Confidential is refused',           /if \(docsIsConfidential\(pos\)\) return false;/.test(al));
ok('and an owner reads it',             /role !== ROLE_OWNER/.test(al));

const pos=grab(proxy,'async function docsPositionOf');
ok('position is read from the Box path', /path_collection/.test(pos));
ok('it anchors on the Documents folder', /n\.startsWith\(DOCS_PREFIX \+ ' '\)/.test(pos));
ok('a lookup failure denies',            /catch\(e\)\{ return null; \}/.test(pos));

console.log('Listing');
const ls=proxy.slice(proxy.indexOf("op === 'docsList'"), proxy.indexOf("op === 'docsRename'"));
ok('the folder is checked twice over',   /guardFolder/.test(ls) && /docsAllows/.test(ls));
ok('at the root Confidential is not listed to outsiders',
   /entries\.filter\(e => String\(e\.name \|\| ''\)\.trim\(\)\.toLowerCase\(\) !== DOCS_PRIVATE\)/.test(ls));
ok('admins are not filtered',            /if \(!who\.isAdmin && pos && pos\.atRoot\)/.test(ls));

console.log('Renaming');
const rn=proxy.slice(proxy.indexOf("op === 'docsRename'"), proxy.indexOf("op === 'list'"));
ok('a slash is refused',                 /\[\\\\\/\\\\\\\\\]/.test(rn) || /cannot contain a slash/.test(rn));
ok('the parent is checked, not just the item', /docsAllows\(H, t, _grants, who, parentId\)/.test(rn));
ok('a file’s parent is resolved',        /fi\.parent && fi\.parent\.id/.test(rn));
// Renaming your own top folder would detach you from your own documents.
ok('a party cannot rename their own folder', /named for your company and cannot be renamed/.test(rn));
ok('a duplicate name is explained',      /Something here already has that name/.test(rn));

console.log('Writing obeys the same rule');
for(const op of ['upload','uploadToken','ensureFolder']){
  const b=proxy.slice(proxy.indexOf("op === '"+op+"'"), proxy.indexOf("op === '"+op+"'")+900);
  // Schedules is the one folder inside Documents that docsAllows refuses
  // outright, because it is reached from the Schedule tab instead. The two
  // upload ops branch on it and answer to schedMayUpload there; everything
  // else in the tab still answers to docsAllows.
  ok(op+' checks the Documents rule',
     /docsPositionOf\(H, body\.(folderId|parentId)\)[\s\S]{0,420}docsAllows/.test(b));
  if(op!=='ensureFolder')
    ok(op+' sends a schedule to its own rule instead', /docsIsSchedules\(pos\)[\s\S]{0,200}schedMayUpload/.test(b));
}

console.log('The browser');
ok('the old index table is gone',   !html.includes('id="tbody-gendocs"'));
ok('the old renderer is a no-op',   /function renderGenDocs\(\)\{\}/.test(src));
ok('there is a folder listing',     html.includes('id="tbody-docs"'));
ok('with breadcrumbs',              html.includes('id="docs-crumbs"'));
ok('folders open on click',         /function docsOpen\(id,name\)/.test(src));
ok('breadcrumbs navigate back',     /function docsGoTo\(i\)/.test(src));
ok('new folders can be made',       /function docsNewFolder/.test(src));
ok('files and folders can be renamed', /async function docsRename\(id, kind, current\)/.test(src));
ok('several files upload at once',  /for\(const f of files\)/.test(grab(src,'async function docsUpload')));
ok('one failure does not stop the rest', /catch\(e\)\{ prog\.textContent='Could not upload/.test(src));
ok('the path resets between projects', /DOCS_PATH=\[\]; DOCS_ENTRIES=\[\];/.test(src));
ok('it loads when the tab opens',   /if\(sec==='gendocs'\)\{ try\{ loadDocs\(\)/.test(src));

console.log('Setting a project up');
// Documents is one shared tree now, so there are no party folders to build.
// What a project needs instead is the standard set, created on sight.
ok('the standard folders are created',  /docsEnsureStandard/.test(src));
ok('and only by Fidevia',               /IS_ADMIN && !viewingAsExternal\(\) && !DOCS_STD_DONE/.test(src));
ok('a failure is shown, not just logged', /DOCS_STD_ERR/.test(src));
ok('the per-party helpers are gone',    !/docsSetupParties|docsPartyNames|PARTY_FOLDERS/.test(src));
ok('and the root no longer claims each party sees only their own',
   !/Each party has their own folder/.test(src));
ok('only missing ones are created', /if \(lower\.has\(name\.toLowerCase\(\)\)\) continue;/.test(proxy));
ok('the nine standard folders are named', ['Testing','ASIs','Inspections','Punch List',
  'Meeting Minutes','Closeout','Drawings and Specifications','Schedules','Fidevia Internal']
  .every(nme=>proxy.includes("'"+nme+"'")));
ok('precon is offered inside the Fidevia-only folder',
   /inFidevia && !hasAll\(PRECON_FOLDERS\)/.test(src));

console.log('What each party is told');
ok('everyone is told it is shared',   /Everyone on the project reads everything here/.test(src));
ok('and that one folder is not',      /Fidevia Internal is the exception/.test(src));
ok('an outside reader is told the same', /The shared record of this project/.test(src));


console.log('A project that predates the module');
const ld=grab(src,'async function loadDocs');
ok('a missing folder is created for admins', /root=await ensureModuleFolder\('gendocs'\)/.test(ld));
ok('externals are told rather than shown an error', /Documents are not set up on this project yet/.test(ld));
ok('a failure offers a retry',                /Try again<\/a>/.test(ld));
const em=grab(src,'async function ensureModuleFolder');
ok('it does nothing when one exists',         /if\(currentProject\.folders\[key\]\) return currentProject\.folders\[key\];/.test(em));
ok('it uses the module’s own folder name',    /name:mod\.folder/.test(em));
ok('and remembers it for the session',        /currentProject\.folders\[key\]=id/.test(em));
// New Folder and Upload can be pressed before the browser has loaded.
ok('New Folder sets up first',  /if\(!docsRootId\(\)\)\{ await loadDocs\(\); if\(!docsRootId\(\)\) return; \}/.test(src));
ok('Upload sets up first',      /if\(!docsRootId\(\)\)\{ await loadDocs\(\); if\(!docsRootId\(\)\)\{ input\.value=''; return; \} \}/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
