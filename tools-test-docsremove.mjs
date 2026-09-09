// Taking a file off the dashboard is not deleting it.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ── it moves, it does not delete ──
{
  const c = srv.split("if (op === 'docsRemove')")[1].split("if (op === 'docsRequestRemoval')")[0];
  ok(!/method: 'DELETE'/.test(c), 'nothing is deleted');
  ok(/method: 'PUT'/.test(c) && /parent: \{ id: String\(bin\.id\) \}/.test(c),
     'the file is moved into the Removed folder');
  ok(/if \(!who\.isAdmin\)/.test(c), 'only Fidevia can do it');
  ok(/if \(!await guardFile\(fileId\)\)/.test(c), 'and only for a file on a project they hold');
  ok(/if \(!pos\) return json\(\{ error: 'That file is not in Documents\.' \}/.test(c),
     'a file outside Documents cannot be removed through this, whatever id is passed');
  ok(/name: 'Removed'/.test(c), 'the folder is made on first use rather than assumed');
  ok(/stamp \+ ' - ' \+ from \+ ' - ' \+ origName/.test(c),
     'the name records when it went and where it came from, which a flat folder cannot');
  ok(/mv\.status === 409/.test(c), 'two removals of the same name on the same day do not collide');
}
// ── and it is invisible afterwards, to everyone ──
{
  const c = srv.split("if (op === 'docsList')")[1].split("if (op === 'docsRename')")[0];
  ok(/String\(e\.name \|\| ''\)\.trim\(\)\.toLowerCase\(\) === DOCS_REMOVED/.test(c),
     'the Removed folder is filtered out of the listing');
  ok(/if \(pos && pos\.atRoot\) \{/.test(c.split('DOCS_REMOVED')[0].slice(-200)),
     'for Fidevia as well, since it is a holding area and not part of the filing');
}
ok(/const DOCS_REMOVED = 'removed'/.test(srv), 'it has one name, used by both');

// ── asking, versus doing ──
{
  const c = srv.split("if (op === 'docsRequestRemoval')")[1].split("if (op === 'docsRemovalRequests')")[0];
  ok(!/who\.isAdmin\) return json\(\{ error: 'Admins only'/.test(c),
     'anyone on the project may ask');
  ok(/callerMayReadFile/.test(c), 'but only about a file they can actually see');
  ok(/already = list\.find/.test(c), 'asking twice does not queue it twice');
  ok(/list\.slice\(0, 200\)/.test(c), 'and the list cannot grow without bound');
}
{
  const c = srv.split("if (op === 'docsRemovalRequests')")[1].split("if (op === 'docsRemove')")[0]
        || srv.split("if (op === 'docsRemovalRequests')")[1].slice(0,1200);
  ok(/if \(!who\.isAdmin\)/.test(c), 'only Fidevia reads the queue');
}

// ── the buttons ──
const b = bootPage('index.html'); b.run(SEED);
const rowsFor = async (external) => {
  b.run(`
    proxyCall = async (op)=> op==='docsList'
      ? {entries:[{id:'9',name:'Site plan.pdf',type:'file',size:10},{id:'8',name:'Testing',type:'folder'}], atRoot:true}
      : {requests:[]};
    currentProject.folders.gendocs='12345'; DOCS_PATH.length=0; DOCS_STD_DONE=true;
    ${external ? "document.body.classList.add('external-mode');" : "document.body.classList.remove('external-mode');"}
  `);
  await b.ctx.loadDocs();
  return b.run("document.getElementById('tbody-docs').innerHTML");
};
let h = await rowsFor(false);
ok(/docsRemove\(/.test(h), 'Fidevia gets Remove on a file');
ok(!/docsAskRemoval\(/.test(h), 'and is not asked to request it from themselves');
h = await rowsFor(true);
ok(/docsAskRemoval\(/.test(h), 'everyone else gets Request removal');
ok(!/docsRemove\(/.test(h), 'and cannot take it down');
ok(!/docsRemove\(|docsAskRemoval\(/.test(h.split('Testing')[0].split('<tr>').pop()||''),
   'a folder offers neither, since this is about files');

// ── the queue is shown where the work happens ──
ok(/id="docs-requests"/.test(html), 'pending requests appear on the Documents tab');
{
  const c = html.split('async function docsLoadRequests()')[1].split('async function docsDismissRequest')[0];
  ok(/!IS_ADMIN \|\| viewingAsExternal\(\) \|\| DOCS_PATH\.length/.test(c),
     'to Fidevia, at the root, and nobody else');
  ok(/Take it down/.test(c) && /Leave it up/.test(c), 'with both answers offered');
}
ok(/docsRemovalRequests[\s\S]{0,200}close:id/.test(html),
   'removing a file answers the request that asked for it');

console.log((bad?'FAIL':'ok  '),' tools-test-docsremove.mjs —',n,'assertions');
process.exit(bad?1:0);
