// Documents is the shared record of the job, with one folder that is not.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ── the folders ──
const FOLDERS=['Testing','ASIs','Inspections','Punch List','Meeting Minutes','Closeout',
               'Drawings and Specifications','Schedules','Confidential'];
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
ok(/Put the contract name in the file name/.test(html),
   'the Schedules folder says so, rather than leaving it to be discovered when reminders keep arriving');
ok(/Fidevia only\. Nobody outside Fidevia can open this folder/.test(html),
   'and Confidential says what it is');

// ── the sidebar ──
ok(!/data-section="documents">Drawings/.test(html), 'Drawings & Specifications is off the sidebar');
ok(!/data-section="meetings">Meeting Minutes/.test(html), 'and so is Meeting Minutes');
ok(/data-section="gendocs">Documents/.test(html), 'Documents remains');
ok(/older meeting minutes/.test(html) && /older drawings/.test(html),
   'and what was already filed under them is still reachable, so the move strands nothing');

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
