// The Documents root has to know it is the root.
//
// Both the standard-folder creation and the catch-up notice were gated on
// !docsHere(), meaning "at the top of the tree". docsHere() returns the root
// folder's own id when you are at the root, so that test was false in exactly
// the place it was meant to be true: the folders were never created and the
// button was never shown, on every project, and the only symptom was an
// absence — which looks the same as nobody having pressed anything.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/function docsHere\(\)\{ return DOCS_PATH\.length \? DOCS_PATH\[DOCS_PATH\.length-1\]\.id : docsRootId\(\); \}/.test(html),
   'docsHere still answers with the root id at the root, which is why it cannot be the root test');
ok(!/!docsHere\(\)/.test(html),
   'and nothing uses it as one');

const run = async (setup) => {
  const b = bootPage('index.html'); b.run(SEED);
  b.run(`
    globalThis.__ops=[];
    proxyCall = async (op)=>{ __ops.push(op);
      if(op==='docsEnsureStandard') return {ok:true, made:['Testing']};
      if(op==='docsList') return {entries:[], atRoot:true};
      return {}; };
    currentProject.folders.gendocs='12345'; DOCS_PATH.length=0;
    ${setup||''}
  `);
  await b.ctx.loadDocs();
  return { ops: JSON.parse(b.run('JSON.stringify(__ops)')),
           box: b.run("document.getElementById('docs-catchup').style.display") };
};

{
  const r = await run();
  ok(r.ops.includes('docsEnsureStandard'),
     'at the root, Fidevia opening the tab creates the folders the project is missing');
  ok(r.box==='block', 'and the catch-up notice is shown');
}
{
  const r = await run("DOCS_PATH.push({id:'999',name:'Testing'});");
  ok(!r.ops.includes('docsEnsureStandard'),
     'inside a folder it does not try again');
  ok(r.box==='none', 'nor offer the notice there');
}
{
  const r = await run("EXTERNAL=true; IS_ADMIN=false;");
  ok(!r.ops.includes('docsEnsureStandard'), 'a contractor never triggers it');
  ok(r.box==='none', 'and is not shown it');
}
{
  // Twice in one project load is once.
  const b = bootPage('index.html'); b.run(SEED);
  b.run(`globalThis.__ops=[]; proxyCall = async (op)=>{ __ops.push(op);
    if(op==='docsEnsureStandard') return {ok:true,made:[]};
    if(op==='docsList') return {entries:[],atRoot:true}; return {}; };
    currentProject.folders.gendocs='12345'; DOCS_PATH.length=0;`);
  await b.ctx.loadDocs(); await b.ctx.loadDocs();
  const ops = JSON.parse(b.run('JSON.stringify(__ops)'));
  ok(ops.filter(o=>o==='docsEnsureStandard').length===1,
     'and reopening the tab does not ask the server to build them again');
}
// The notice is a block; .admin-only would otherwise make it inline-block.
ok(/cu\.style\.display = show \? 'block' : 'none';/.test(html),
   'the notice is laid out as the block it is');

console.log((bad?'FAIL':'ok  '),' tools-test-docsroot.mjs —',n,'assertions');
process.exit(bad?1:0);
