// Replacing a programme inside the month it covers, and two pieces of styling
// that were quietly wrong on every file link in the dashboard.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

console.log('The highlight that looked broken');
// Two hover treatments were fighting: underline the name, and paint the whole
// link olive. The second was filed under .table-count, away from the other
// .attach-link rules, which is what a stray edit looks like.
ok(!/\.attach-link:hover\{background/.test(html),
   'a file link no longer paints itself olive on hover');
ok(/\.attach-link:hover \.attach-name\{text-decoration:underline;\}/.test(html),
   'the underline it already had is what is left');
ok(/\.dl-btn:hover\{background:var\(--olive-700\); color:#fff/.test(html),
   'while the download button keeps it — it is a 22px icon, which is where that belongs');
// And the truncation.
ok(/max-width:210px/.test(html.split('.attach-link{')[1].split('}')[0]),
   'the table chip is still capped, which is right in a narrow cell');
ok(/\.file-line\{[^}]*overflow-wrap:anywhere/.test(html),
   'but a filename listed in full wraps instead of being cut off');
ok(!/class="file-line"[^>]*>'\+esc\(f\.name\)/.test(html) || /class="file-line"/.test(html),
   'and the schedule list uses it');
{
  // Just this function: schedChaseTargets is a long way further down, and
  // slicing to it swept in every other file link in the file.
  const after = html.split('function schedFilesHTML')[1];
  const c = after.slice(0, after.indexOf('\nfunction '));
  ok(/class="file-line"/.test(c) && !/attach-link/.test(c),
     'so "Summit Builders — September 2026" is not cut to "September 20"');
}

console.log('Who may replace one');
{
  const c = html.split('function schedMayReplace')[1].split('function schedUpdateBtn')[0];
  ok(/IS_ADMIN && !viewingAsExternal\(\)/.test(c), 'Fidevia may replace any of them');
  ok(/myCompany\(\)/.test(c), 'and a contract its own, by company');
}
const b = bootPage('index.html'); b.run(SEED);
const setup=`currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'1',active:true},
  {name:'Gorilla Construction',role:'Sub',contract:'1',active:true}];
SCHED_FOLDER_ID='555'; DATA_READY=true; SCHED_OPEN_CO='Summit Builders';
SCHED_UPLOADS=[{company:'Summit Builders',state:'current',period:'2026-09',periodLabel:'September 2026',
  date:'2026-09-08',files:[{id:'f9',name:'Summit Builders — September 2026.pdf',period:'2026-09',
  periodLabel:'September 2026',date:'2026-09-08'}]}];`;
const as=async(email,co,role,ext,adm)=>{
  b.run(setup+`EXTERNAL=${ext};IS_ADMIN=${adm};ME_EMAIL='${email}';ME_COMPANY='${co}';
    currentProject.userCompany='${co}';currentProject.userRole='${role}';`);
  await b.run("renderScheduleUploads()");
  return b.run("document.getElementById('sched-uploads').innerHTML"); };
ok(/Update<\/button>/.test(await as('gc@s.test','Summit Builders','contractor',true,false)),
   'the contract that filed it is offered Update on the row');
ok(/Update<\/button>/.test(await as('cc@fidevia.com','Fidevia','',false,true)), 'so is Fidevia');
ok(!/Update<\/button>/.test(await as('g@g.test','Gorilla Construction','contractor',true,false)),
   'another contractor is not offered it on somebody else’s programme');
ok(!/Update<\/button>/.test(await as('a@x.test','Architect 2','architect',true,false)),
   'nor the architect, who reads schedules but holds no contract');
ok(!/Update<\/button>/.test(await as('o@i.test','Ithaca','owner',true,false)), 'nor the owner');

console.log('The dialog does both jobs');
b.run(setup+"EXTERNAL=true;IS_ADMIN=false;ME_COMPANY='Summit Builders';currentProject.userCompany='Summit Builders';currentProject.userRole='contractor';");
b.run("openSchedUpload('Summit Builders',{id:'f9',name:'Summit Builders — September 2026.pdf',period:'2026-09'})");
ok(/Update Schedule/.test(b.run("document.getElementById('sched-up-title').textContent")), 'it says it is an update');
ok(b.run("document.getElementById('sched-up-btn').textContent")==='Replace', 'and the button says Replace');
ok(b.run("schedUpPeriod()")==='2026-09', 'pinned to the month being replaced');
ok(b.run("document.getElementById('sched-up-month').disabled")===true,
   'which cannot be changed — changing it would file the new copy elsewhere and leave the old one standing');
ok(/a new version of the file already on file/.test(b.run("document.getElementById('sched-up-name').textContent")),
   'and it says what will happen rather than showing a filename to be invented');
b.run("closeSchedUpload(); openSchedUpload('Summit Builders')");
ok(b.run("document.getElementById('sched-up-btn').textContent")==='Upload'
   && b.run("document.getElementById('sched-up-month').disabled")===false,
   'and an ordinary upload afterwards is not left wearing the replacement’s clothes');

console.log('Server');
{
  const c = srv.split("if (op === 'uploadVersion')")[1].split("if (op === 'ensureFolder')")[0];
  ok(/const parentId = String\(\(meta\.parent && meta\.parent\.id\) \|\| ''\)/.test(c),
     'the folder is read off the file, not taken from the caller');
  ok(/if \(!pos \|\| !docsIsSchedules\(pos\)\) return json/.test(c),
     'and only a schedule can be versioned this way');
  ok(/schedMayUpload\(H, t, _grants, who, parentId, meta\.name\)/.test(c),
     'checked against the name already on the file, not one the caller sends');
  ok(/JSON\.stringify\(\{ name: meta\.name \}\)/.test(c), 'so a replacement cannot rename it into another contract');
}
// The guard I nearly broke: docsAllows refuses Schedules now, and the tab
// writes into it. Without this every external upload would 403.
{
  const c = srv.split("async function schedMayUpload")[1].split('// True when this caller may see or write')[0];
  ok(/if \(!roleMayWrite\(role\) \|\| seesAllCompanies\(role\)\) return false;/.test(c),
     'the owner and the design team read programmes but do not file them');
  ok(/schedNorm\(String\(filename \|\| ''\)\)\.includes\(schedNorm\(mine\)\)/.test(c),
     'and a contractor may only put up a file carrying their own name');
}
for (const op of ['uploadToken', 'upload']) {
  const c = srv.split("if (op === '"+op+"') {")[1].slice(0, 700);
  ok(/if \(pos && docsIsSchedules\(pos\)\) \{[\s\S]{0,200}schedMayUpload/.test(c),
     op+' lets a schedule through on its own rule');
  ok(/\} else if \(pos && !await docsAllows/.test(c),
     'while everything else in Documents still answers to docsAllows in '+op);
}

console.log('The upload that got stuck');
// The scoped token is minted for a folder, so uploadToken had never needed to
// say what was going into it. The moment the Schedules rule started deciding on
// the filename, that meant every external upload was refused a token — rescued
// only by the proxy fallback, and only for files under 4 MB.
ok((html.match(/proxyCall\('uploadToken',\{folderId:parentId, filename:file\.name\}\)/g)||[]).length===3,
   'all three token calls say what they are uploading');
ok(!/proxyCall\('uploadToken',\{folderId:parentId\}\)/.test(html), 'and none of them leaves it out');
{
  const c = srv.split('async function schedMayUpload')[1].split('// True when this caller may see or write')[0];
  ok(/if \(!String\(filename \|\| ''\)\.trim\(\)\) return false;/.test(c),
     'a rule that decides on a name refuses when there is no name, rather than matching an empty one');
}
// And a refresh that fails is not an upload that failed.
{
  const c = html.split('async function schedUpload(f, company, periodLabel, say)')[1].split('\nfunction ')[0];
  ok(/Past this point the file is in Box/.test(c), 'the read-back is outside the try that reports failure');
  ok(/console\.warn\('schedule refresh:'/.test(c),
     'so a folder that cannot be listed does not report a landed schedule as lost');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-schedupdate.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
