// Fidevia Internal is the one closed folder in a tab that is otherwise open to
// the whole project. Worth proving rather than asserting.
import fs from 'fs';
const srv = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// Run the real docsAllows against a stand-in Box.
const grab=(sig,end)=>srv.slice(srv.indexOf(sig), srv.indexOf(end));
const code = grab('async function docsPositionOf','const reqKey =');
const pre = `
const DOCS_PREFIX='12';
const ROLE_OWNER='owner';
function normRole(r){ return String(r||'').trim().toLowerCase(); }
function roleMayWrite(role){ return role !== ROLE_OWNER; }
let TREE={};
async function boxFetch(url){
  const m=String(url).match(/folders\\/([^/?]+)\\?/);
  const id=m&&m[1];
  return TREE[id] ? {ok:true, json:async()=>TREE[id]} : {ok:false};
}
let GRANT=null;
async function grantFor(){ return GRANT; }
`;
const H={}, t='';
const F = new Function(pre + code + `
return { docsAllows, docsPositionOf, docsIsConfidential,
  set:(tree,grant)=>{TREE=tree; GRANT=grant;} };`)();

// 12 - Documents / Fidevia Internal / Precon   and   / Meeting Minutes
F.set({
  'root':   {name:'12 - Documents', path_collection:{entries:[{name:'Ithaca'}]}},
  'fi':     {name:'Fidevia Internal', path_collection:{entries:[{name:'Ithaca'},{name:'12 - Documents'}]}},
  'deep':   {name:'Budget', path_collection:{entries:[{name:'Ithaca'},{name:'12 - Documents'},{name:'Fidevia Internal'},{name:'Precon'}]}},
  'shared': {name:'Meeting Minutes', path_collection:{entries:[{name:'Ithaca'},{name:'12 - Documents'}]}},
  'outside':{name:'01 - RFIs', path_collection:{entries:[{name:'Ithaca'}]}}
}, {company:'Summit Builders', role:'contractor'});

const ask = (folder, who) => F.docsAllows(H, t, [], who, folder);
const FIDEVIA = {isAdmin:true};
const ROLES = [['contractor','Summit Builders'],['architect','Architect 2'],
               ['engineer','Next Level Engineers'],['owner','Ithaca']];

// ── Fidevia ──
ok(await ask('fi', FIDEVIA), 'Fidevia can open Fidevia Internal');
ok(await ask('deep', FIDEVIA), 'and anything nested inside it');

// ── everyone else ──
for (const [role, company] of ROLES){
  F.set({
    'root':   {name:'12 - Documents', path_collection:{entries:[{name:'Ithaca'}]}},
    'fi':     {name:'Fidevia Internal', path_collection:{entries:[{name:'Ithaca'},{name:'12 - Documents'}]}},
    'deep':   {name:'Budget', path_collection:{entries:[{name:'Ithaca'},{name:'12 - Documents'},{name:'Fidevia Internal'},{name:'Precon'}]}},
    'shared': {name:'Meeting Minutes', path_collection:{entries:[{name:'Ithaca'},{name:'12 - Documents'}]}}
  }, {company, role});
  const who = {isAdmin:false, email:'x@'+company.replace(/\s+/g,'')+'.test'};
  ok(!(await ask('fi', who)),   'a '+role+' cannot open Fidevia Internal');
  ok(!(await ask('deep', who)), 'nor reach into it by a nested folder id');
  ok(await ask('shared', who),  'but reads the shared folders, as intended');
}
// Somebody with no grant on the project gets nothing at all.
F.set({'fi':{name:'Fidevia Internal', path_collection:{entries:[{name:'Ithaca'},{name:'12 - Documents'}]}}}, null);
ok(!(await F.docsAllows(H,t,[],{isAdmin:false},'fi')), 'and a stranger to the project reads nothing');

// ── the ops that must consult it ──
// Slice to the end of each op rather than to its first `const`: docsRename
// resolves a file's parent before it checks, and cutting at the first const
// stopped short of the check itself.
[['docsList',"if (op === 'docsRename')"],
 ['docsRename',"// A party's own top-level folder"],
 ['uploadToken','const r = await boxFetch'],
 ['upload','const chk = await boxFetch'],
 ['ensureFolder','const name = String']].forEach(([op,end])=>{
  const seg = srv.split("if (op === '"+op+"')")[1].split(end)[0];
  ok(/docsAllows/.test(seg), op+' checks it before acting');
});
// Opening a file by id resolves through the folder it sits in.
{
  const c = srv.split('// Documents holds files in folders')[1].split('export default')[0];
  ok(/docsAllows\(H, t, grants, who, parentId\)/.test(c),
     'a file is judged by the folder holding it, so one inside is refused too');
}
// It is not offered in the listing either, so its existence is not advertised.
{
  const c = srv.split("if (op === 'docsList')")[1].split("if (op === 'docsRename')")[0];
  ok(/!== DOCS_PRIVATE/.test(c), 'and it is not listed to anyone outside Fidevia');
}
// ── the index CSVs are plumbing, not documents ──
{
  const c = srv.split("if (op === 'docsList')")[1].split("if (op === 'docsRename')")[0];
  ok(/DOCS_HIDDEN_FILES\.has/.test(c), 'the dashboard\u2019s own index files are withheld too');
}
ok(/const DOCS_HIDDEN_FILES = new Set\(\['documents\.csv', 'document index\.csv'\]\)/.test(srv),
   'named explicitly, so a CSV somebody uploads is still theirs to open');

// ── and the preview does not misrepresent either of them ──
// The server cannot withhold anything in External Viewer, because the request
// is still Fidevia's. The browser has to, or the preview shows a contractor a
// folder and a file they will never see.
ok(/DOCS_AT_ROOT && viewingAsExternal\(\)/.test(html),
   'the preview filters the root as the server would for a real outsider');
ok(/nm!==DOCS_CONFIDENTIAL && !DOCS_HIDDEN_FILES\.has\(nm\)/.test(html),
   'hiding both the folder and the plumbing');

// Who counts as Fidevia.
ok(/const ADMIN_DOMAIN = 'fidevia\.com'/.test(srv), 'Fidevia means an @fidevia.com address');
ok(/admins\.includes\(email\) \|\| blobAdmins\.includes\(email\)/.test(srv),
   'or an address added to the administrator list, which is the one way in from outside the domain');

console.log((bad?'FAIL':'ok  '),' tools-test-internal.mjs —',n,'assertions');
process.exit(bad?1:0);
