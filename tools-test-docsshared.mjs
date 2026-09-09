// Documents is the shared record of the job, with one folder that is not.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ── the folders ──
// Schedules is deliberately not among them any more: it moved to the Schedule
// tab, which is where the question it answers gets asked. It is still created,
// because the files have to live somewhere in Box.
const FOLDERS=['Testing','ASIs','Inspections','Punch List','Meeting Minutes','Closeout',
               'Drawings and Specifications','Fidevia Internal'];
FOLDERS.forEach(f=>{
  ok(new RegExp("'"+f.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+"'").test(srv.split('const DOCS_FOLDERS')[1].split(']')[0]),
     'the server knows about '+f);
});
ok(/const DOCS_FOLDERS=\['Testing'/.test(html.replace(/\s+/g,' ').replace(/const DOCS_FOLDERS=\[ /,"const DOCS_FOLDERS=['"))
   || /DOCS_FOLDERS=\['Testing'/.test(html), 'and so does the browser');

// ── who may see what ──
{
  const c = srv.split('async function docsAllows')[1].split('const reqKey =')[0];
  ok(!/pos\.party.*=== mine|mine.*=== .*pos\.party/.test(c),
     'the company test is gone: Documents is no longer a folder per firm');
  ok(/if \(docsIsConfidential\(pos\)\) return false;/.test(c),
     'except Confidential, which is refused to everyone outside Fidevia');
  ok(/role !== ROLE_OWNER/.test(c), 'an owner reads it');
  ok(/if \(!g\) return false;/.test(c), 'and somebody with no grant on the project reads nothing');
}
{
  const c = srv.split("if (op === 'docsList')")[1].split("if (op === 'docsRename')")[0];
  ok(/entries\.filter\(e => String\(e\.name \|\| ''\)\.trim\(\)\.toLowerCase\(\) !== DOCS_PRIVATE\)/.test(c),
     'Confidential is not even listed to them, rather than shown and then refused');
  ok(!/const mine = String\(\(g && g\.company\)/.test(c),
     'and the root is no longer filtered to the caller’s own company');
}
ok(/if \(op === 'docsEnsureStandard'\)/.test(srv), 'the standard folders can be created');
{
  const c = srv.split("if (op === 'docsEnsureStandard')")[1].split("if (op === 'docsList')")[0];
  ok(/if \(!who\.isAdmin\)/.test(c), 'by Fidevia only');
  ok(/if \(lower\.has\(name\.toLowerCase\(\)\)\) continue;/.test(c),
     'and running it twice does not duplicate them');
}

// ── the schedule reminder survives the move ──
{
  const c = srv.split("if (op === 'scheduleUploads')")[1].split("if (op === 'docsEnsureStandard')")[0]
        || srv.split("if (op === 'scheduleUploads')")[1].slice(0,4000);
  ok(/sharedFiles\.filter\(f => norm\(f\.name\)\.includes\(norm\(co\)\)\)/.test(c),
     'a shared folder cannot say whose a file is, so the filename does');
  ok(/if \(party\) \{/.test(c),
     'and anything already in a company folder still counts, so nothing uploaded stops being a schedule');
}
// Naming is no longer the contractor's problem: the Schedule tab files it for
// them. The folder points there rather than teaching a convention.
ok(/Schedules moved to the /.test(html),
   'and a stale page still sitting in that folder is sent to the tab');
ok(!/'Schedules'/.test(srv.split('const DOCS_FOLDERS')[1].split(']')[0]),
   'the server does not list it as a standard folder');
ok(/DOCS_FOLDERS\.concat\(\['Schedules'\]\)/.test(srv),
   'but still makes one, or a project could not take a programme');
ok(/Fidevia only\. Nobody outside Fidevia can open this folder/.test(html),
   'and Confidential says what it is');

// ── the sidebar ──
ok(!/data-section="documents">Drawings/.test(html), 'Drawings & Specifications is off the sidebar');
ok(!/data-section="meetings">Meeting Minutes/.test(html), 'and so is Meeting Minutes');
ok(/data-section="gendocs">Documents/.test(html), 'Documents remains');
// The two tabs are gone entirely now, so what they held is moved rather than
// merely linked to.
ok(!/id="section-meetings"/.test(html) && !/id="section-documents"/.test(html),
   'the two retired tabs are removed, not just hidden');
ok(/if \(op === 'docsMigrateLegacy'\)/.test(srv),
   'and there is an action that moves what they were holding');
{
  // Bounded to this op alone: docsRemoveLegacy now sits between it and
  // docsList, and that one does delete — deliberately, and only empty folders.
  const c = srv.split("if (op === 'docsMigrateLegacy')")[1].split("if (op === 'docsRemoveLegacy')")[0];
  ok(/if \(!who\.isAdmin\)/.test(c), 'run by Fidevia only');
  ok(/prefix: '07'/.test(c) && /prefix: '10'/.test(c), 'from both old module folders');
  ok(/if \(have\.has\(nm\.toLowerCase\(\)\)\)/.test(c),
     'a name already at the destination is left alone rather than overwritten');
  ok(/nm\.toLowerCase\(\) === pair\.skip/.test(c), 'the old index CSV stays where it is');
  ok(/skipped\.push/.test(c), 'and anything it could not move is reported rather than swallowed');
  ok(!/delete/i.test(c), 'nothing is deleted');
}
ok(/function docsCatchUp\(\)/.test(html), 'Fidevia can run it from the tab');
ok(/Nothing is deleted, and a file already at the destination is left alone/.test(html),
   'and is told what it will and will not do before pressing it');

// ── it still runs ──
const b = bootPage('index.html'); b.run(SEED);
['navTo','loadDocs','docsOpen'].forEach(fn=>{
  let threw=null;
  try{ const r=fn==='navTo'?b.ctx[fn]('gendocs'):(fn==='docsOpen'?b.ctx[fn]('1','Schedules'):b.ctx[fn]());
       if(r&&r.then) r.catch(()=>{}); }catch(e){ threw=e; }
  ok(!threw, fn+' runs'+(threw?' — '+threw.message:''));
});
ok(b.errors.length===0, 'and the page still boots clean');

console.log((bad?'FAIL':'ok  '),' tools-test-docsshared.mjs —',n,'assertions');
process.exit(bad?1:0);
