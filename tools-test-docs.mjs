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
// The important departure: seesAllCompanies is NOT consulted here.
ok('an architect is not exempted',     !/seesAllCompanies/.test(al));
ok('a caller with no company is refused', /if \(!mine\) return false;/.test(al));
ok('the root is allowed, then filtered',  /if \(pos\.atRoot\) return true;/.test(al));
ok('below the root the folder must be theirs',
   /String\(pos\.party\)\.trim\(\)\.toLowerCase\(\) === mine/.test(al));

const pos=grab(proxy,'async function docsPositionOf');
ok('position is read from the Box path', /path_collection/.test(pos));
ok('it anchors on the Documents folder', /n\.startsWith\(DOCS_PREFIX \+ ' '\)/.test(pos));
ok('a lookup failure denies',            /catch\(e\)\{ return null; \}/.test(pos));

console.log('Listing');
const ls=proxy.slice(proxy.indexOf("op === 'docsList'"), proxy.indexOf("op === 'docsRename'"));
ok('the folder is checked twice over',   /guardFolder/.test(ls) && /docsAllows/.test(ls));
ok('at the root a party sees only their own folder',
   /entries\.filter\(e => e\.type === 'folder' && String\(e\.name \|\| ''\)\.trim\(\)\.toLowerCase\(\) === mine\)/.test(ls));
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
  ok(op+' checks the Documents rule', /docsPositionOf\(H, body\.(folderId|parentId)\)[\s\S]{0,160}docsAllows/.test(b));
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
ok('party folders are offered',     /async function docsSetupParties/.test(src));
ok('parties come from contractors, contacts and the owner',
   /\(cfg\.contractors\|\|\[\]\)[\s\S]{0,300}allData\.contacts[\s\S]{0,120}cfg\.owner/.test(grab(src,'function docsPartyNames')));
ok('Fidevia always has one',        /new Set\(\['Fidevia'\]\)/.test(src));
ok('only missing ones are created', /const missing=names\.filter\(n=>!have\.has/.test(src));
ok('the precon structure matches Box',
   ['Budget','RFPs_Proposals','Bidding','Meetings','Misc','Schedule','Drawings','Reports','Phasing','Constructability','Agreements','Design','Photos']
     .every(n=>src.includes("'"+n+"'")));
ok('precon is offered inside Fidevia’s folder only',
   /DOCS_PATH\[0\]\.name\)\.trim\(\)\.toLowerCase\(\)==='fidevia'/.test(src));

console.log('What each party is told');
ok('Fidevia is told they see all',  /You see all of them/.test(src));
ok('a party is told theirs is private', /Only your company and Fidevia can see what is here/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
