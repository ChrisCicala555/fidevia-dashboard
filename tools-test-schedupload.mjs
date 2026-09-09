// A contractor posts their programme from the row it belongs to, and that is
// what tells the shared folder whose it is.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const strip=x=>String(x).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

// ── the Fidevia-only folder, renamed ──
ok(/'Fidevia Internal'\]/.test(srv), 'the private folder is named for whose it is');
ok(/const DOCS_PRIVATE = 'fidevia internal'/.test(srv), 'and the rule follows the new name');
// The word survives in a comment explaining why it was dropped; what matters
// is that no folder is called it.
ok(!/'Confidential'/.test(srv.split('const DOCS_FOLDERS')[1].split(']')[0]),
   'no folder is named Confidential any more');
ok(!/DOCS_CONFIDENTIAL='confidential'/.test(html), 'and from the browser');
ok(/overstated it/.test(srv), 'with the reason for the change recorded');

// ── the upload ──
ok(/function schedUploadBtn\(company\)/.test(html), 'each contract row carries an upload');
{
  const c = html.split('async function schedUpload(f, company, periodLabel, say)')[1].split('function schedChaseFooter')[0];
  // The month is the one the uploader named, not the one it happens to be.
  ok(/safeFileName\(company\+' \\u2014 '\+periodLabel\)/.test(c),
     'the file is named for the contract and the month, so the shared folder can still say whose it is');
  ok(/SCHED_FOLDER_ID/.test(c), 'it goes to the shared Schedules folder');
  ok(/has no Schedules folder yet/.test(c), 'and says so plainly when the project has none');
  // Nothing refuses a duplicate now: it lands under a Dup_ name and the panel
  // says which. tools-test-dupname.mjs covers the naming itself.
  ok(/One was already on file for that month, so this went up as /.test(c),
     'a second upload in the same month lands and says where, rather than being refused');
  ok(/SCHED_UPLOADS=null/.test(c), 'the panel rechecks itself afterwards');
  ok(/auditLog\('Schedule uploaded'/.test(c), 'and the upload is on the record');
}
ok(/schedulesFolderId: shared \? String\(shared\.id\) : ''/.test(srv),
   'the server hands back the folder so nobody has to go looking for it');

// ── who sees what ──
const b = bootPage('index.html'); b.run(SEED);
b.run(`SCHED_FOLDER_ID='555';
  currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'2000000',active:true},
                                     {name:'AH Plumbing',role:'Sub',contract:'250000',active:true}];
  SCHED_UPLOADS=[{company:'Summit Builders',state:'stale',date:'2026-08-12'},{company:'AH Plumbing',state:'never'}];`);
b.run("renderScheduleUploads()");
let out = strip(b.run("document.getElementById('sched-uploads').innerHTML"));
ok(/Summit Builders/.test(out) && /AH Plumbing/.test(out), 'Fidevia sees every contract');
ok((out.match(/Upload/g)||[]).length>=2, 'each with an upload');
ok(/Remind/.test(out), 'and the chase, which is theirs');

b.run("EXTERNAL=true; IS_ADMIN=false; currentProject.userCompany='Summit Builders';"
    + "SCHED_UPLOADS=[{company:'Summit Builders',state:'stale',date:'2026-08-12'}];");
b.run("renderScheduleUploads()");
out = strip(b.run("document.getElementById('sched-uploads').innerHTML"));
ok(b.run("document.getElementById('sched-uploads-panel').style.display")!=='none',
   'a contractor sees the panel, which is where they post');
ok(/Summit Builders/.test(out), 'showing their own contract');
ok(!/AH Plumbing/.test(out), 'and nobody else’s');
ok(/Upload/.test(out), 'with somewhere to put it');
ok(!/Remind/.test(out), 'and no way to remind themselves');
ok(!/Remind All/.test(out), 'nor to chase the job');
ok(/Everyone on the project can see it/.test(out),
   'told plainly that a schedule posted here is shared');

b.run("currentProject.userCompany='Architect 2';");
b.run("renderScheduleUploads()");
ok(b.run("document.getElementById('sched-uploads-panel').style.display")==='none',
   'somebody who holds no contract is not asked for a programme');

// ── the Documents tab points at the easier route ──
ok(/which files it under the right contract for you/.test(html),
   'the Schedules folder sends people to the Schedule tab rather than to a naming convention');
ok(/Fidevia only\. Nobody outside Fidevia can open this folder/.test(html),
   'and the internal folder still says what it is');

console.log((bad?'FAIL':'ok  '),' tools-test-schedupload.mjs —',n,'assertions');
process.exit(bad?1:0);
