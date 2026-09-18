// "Maybe next to the contact directory tab, have a Project Settings button
// that applies to all new projects... I would like to customize what the
// standard documents tab looks like."
//
// Fidevia's defaults rather than any one project's: the folders a new project
// starts with, who may see each one, and one level of subfolders. Existing
// projects are deliberately untouched — the Documents tab already has a
// "Bring It Up To Date" that adds what is missing, and nothing here deletes or
// renames anything in Box.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage('index.html'); P.run(SEED);
const set=(list)=>P.run(`PS_FOLDERS=${JSON.stringify(list)}; PS_DIRTY=false; psRender(); 1;`);
const probs=(list)=>JSON.parse(P.run(`JSON.stringify(psProblems(${JSON.stringify(list)}))`));
const view=()=>P.run("document.getElementById('ps-folders').innerHTML");

console.log('It is Fidevia’s alone');
ok(/onclick="openProjSettings\(\)"/.test(html), 'there is a button for it');
ok(/admin-only" onclick="openProjSettings/.test(html), 'and it is admin-only, like the directory');
ok(/settingsSave/.test(fs.readFileSync('netlify/functions/box-proxy.mjs','utf8')), 'the server has somewhere to put it');

console.log('The page says what it does and does not touch');
ok(/does not touch/.test(html) && /added on sight/.test(html),
   'that existing projects are unaffected, and that opening one picks up what it is missing \u2014 '
   +'no longer pointing at a button that was removed');
ok(/renamed or deleted in Box/.test(html), 'and that nothing is destroyed');

console.log('Editing the list');
set([{name:'Testing',visibility:'all',children:[]}]);
P.run("psAddFolder()");
ok(P.run("PS_FOLDERS.length")===2, 'a folder can be added');
ok(P.run("PS_DIRTY")===true, 'which marks the page unsaved');
P.run("psRename(1,'Closeout')");
ok(P.run("PS_FOLDERS[1].name")==='Closeout', 'and renamed');
P.run("psAddChild(1); psRenameChild(1,0,'O&M Manuals')");
ok(P.run("PS_FOLDERS[1].children[0].name")==='O&M Manuals', 'a subfolder can be added and named');
ok(/O&amp;M Manuals/.test(view()), 'and is drawn escaped, not as markup');
P.run("psMove(1,-1)");
ok(P.run("PS_FOLDERS[0].name")==='Closeout', 'order can be changed');
P.run("psSetVis(0,'design')");
ok(P.run("PS_FOLDERS[0].visibility")==='design', 'and visibility set per folder');
P.run("psDelChild(0,0)");
ok((P.run("PS_FOLDERS[0].children.length"))===0, 'a subfolder can be removed');

console.log('Fidevia Internal cannot be published by a dropdown');
set([{name:'Fidevia Internal',visibility:'fidevia',children:[]},{name:'Testing',visibility:'all',children:[]}]);
ok(/Fidevia only — always/.test(view()), 'it has no visibility control at all');
ok(!/psDelFolder\(0\)/.test(view()), 'and cannot be removed');
P.run("psRename(0,'Everyone Please Look')");
ok(P.run("PS_FOLDERS[0].name")==='Fidevia Internal', 'nor renamed out of being itself');
ok(/psDelFolder\(1\)/.test(view()), 'while an ordinary folder can be removed');

console.log('What it refuses to save');
ok(probs([]).length===1, 'an empty list is refused');
ok(/at least one/.test(probs([])[0]), 'saying so');
ok(probs([{name:'  '}]).some(x=>/no name/.test(x)), 'a folder with no name');
ok(probs([{name:'A'},{name:'a'}]).some(x=>/twice/.test(x)), 'the same folder twice, whatever the case');
ok(probs([{name:'a/b'}]).some(x=>/slash/.test(x)), 'a slash in a name');
ok(probs([{name:'A',children:[{name:'x'},{name:'X'}]}]).some(x=>/twice under/.test(x)),
   'and the same subfolder twice under one folder');
ok(probs([{name:'A',children:[{name:' '}]}]).some(x=>/subfolder of/.test(x)), 'a nameless subfolder');
ok(probs([{name:'Testing',visibility:'all',children:[{name:'Concrete'}]}]).length===0,
   'a sensible list is fine');
ok(probs([{name:'A'},{name:'A'},{name:'a/b'}]).length===2, 'and each problem is said once');
ok(probs([{name:'A'},{name:'A'},{name:'A'}]).length===1,
   'three of the same folder is still one complaint, not a wall of them');

console.log('Saving');
// proxyCall stubbed: what matters is whether it is reached at all, and what
// it is handed when it is.
// Counted by op: psSave also writes an audit entry through proxyCall, and a
// bare counter was picking that up.
const stub=`window.__sent=null; window.__calls=0;
  proxyCall=async function(op,body){
    if(op==='settingsSave'){ window.__calls++; window.__sent={op:op,body:body}; }
    return {ok:true, settings:{docFolders:((body&&body.docFolders)||[]).map(f=>({name:f.name,visibility:f.visibility||'all',children:f.children||[]}))}}; };`;
P.run(stub);
set([{name:'A',visibility:'all',children:[]},{name:'a',visibility:'all',children:[]}]);
await P.run("psSave()");
ok(P.run("window.__calls")===0, 'a list with a duplicate is never sent');
ok(P.run("window.__sent")===null, 'nothing was handed over at all');
ok(/listed twice/.test(P.run("document.getElementById('ps-status').textContent")),
   'and the page says which folder and why');
ok(P.run("document.getElementById('ps-status').style.display")!=='none', 'where it can be seen');

P.run(stub);
set([{name:'Testing',visibility:'all',children:[]}]);
P.run("psAddChild(0); psRenameChild(0,0,'Concrete'); psSetVis(0,'design');");
ok(P.run("PS_DIRTY")===true, 'editing marks the page unsaved');
await P.run("psSave()");
ok(P.run("window.__calls")===1, 'a sound list is sent');
ok(P.run("window.__sent.op")==='settingsSave', 'to the op that stores it');
ok(P.run("window.__sent.body.docFolders[0].visibility")==='design', 'carrying the visibility');
ok(P.run("window.__sent.body.docFolders[0].children[0].name")==='Concrete', 'and the subfolders');
ok(P.run("PS_DIRTY")===false, 'the page is no longer unsaved');
ok(/Saved/.test(P.run("document.getElementById('ps-status').textContent")), 'and says so');

console.log('The listed problems are what the server would have dropped silently');
{
  const bad=[{name:'A'},{name:'a'}];
  ok(probs(bad).length>0, 'the page refuses a duplicate');
  // cleanTemplate would have taken the first and binned the second without a word.
  ok(/sanitises/.test(html) || /cannot trust this/.test(html),
     'and says why it checks as well as the server');
}

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
