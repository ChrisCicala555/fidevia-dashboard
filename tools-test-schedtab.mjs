// Schedules left Documents. They live in the Schedule tab, which is where the
// question they answer — who still owes us this month's programme — is
// actually asked. A folder in a browser answers that for nobody.
//
// Moving them means the rule that used to govern them ("can you open the
// folder it is in") now says no to everyone, so this checks what replaced it.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

console.log('Out of the filing system');
ok(!/'Drawings and Specifications', 'Schedules'/.test(srv), 'not a standard Documents folder any more');
ok(!/'Drawings and Specifications','Schedules'/.test(html), 'client side either');
ok(/DOCS_FOLDERS\.concat\(\['Schedules'\]\)/.test(srv),
   'but still created, or a project could not take a programme at all');
ok(/String\(e\.name \|\| ''\)\.trim\(\)\.toLowerCase\(\) === DOCS_SCHEDULES/.test(srv),
   'and filtered out of the folder listing');
{
  // Hidden from Fidevia too. Two ways into the same files is how the two of
  // them drift, which is exactly what happened to the chase.
  const block = srv.split("entries = entries.filter(e => !(e.type === 'folder' && String(e.name || '').trim().toLowerCase() === DOCS_REMOVED));")[1].slice(0,600);
  ok(/DOCS_SCHEDULES/.test(block), 'for everybody, not only for external users');
  ok(!/who\.isAdmin/.test(block.split('DOCS_SCHEDULES')[0]), 'with no administrator exemption above it');
}
ok(/if \(docsIsSchedules\(pos\)\) return false;/.test(srv),
   'and nothing can be filed into it by hand through Documents');

console.log('Who may open one');
{
  const c = srv.split('async function callerMayReadFile')[1].split('export default')[0];
  ok(/docsIsSchedules\(await docsPositionOf\(H, parentId\)\)/.test(c),
     'a schedule file is recognised as a schedule file');
  ok(/if \(seesAllCompanies\(normRole\(g\.role\)\)\) return true;/.test(c),
     'Fidevia, the owner and the design team may open any of them');
  ok(/schedNorm\(String\(d\.name \|\| ''\)\)\.includes\(schedNorm\(mine\)\)/.test(c),
     'a contract may open its own, matched on the filename');
  ok(/if \(!g\) return false;/.test(c), 'and somebody with no grant on the project may open none');
  ok(/fields=name,path_collection/.test(c),
     'which needs the name, so it is asked for rather than assumed');
}
{
  const c = srv.split("if (op === 'scheduleUploads')")[1].slice(0,1400);
  ok(/if \(!seesAllCompanies\(normRole\(g\.role\)\)\) \{[\s\S]{0,220}companies = \[mine\];/.test(c),
     'a contractor is answered about their own contract and nobody else’s');
  ok(/if \(!g\) return json\(\{ error: 'Access denied' \}, 403\)/.test(c),
     'and a caller with no grant is refused outright');
}
ok(/const listed = newestFirst\(files\)\.slice\(0, 24\)/.test(srv),
   'the files come back with the answer, since this is now the only listing of them');

console.log('The tab');
const b = bootPage('index.html'); b.run(SEED);
const setup = `currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'1',active:true}];
  SCHED_FOLDER_ID='555'; DATA_READY=true;
  SCHED_UPLOADS=[{company:'Summit Builders',state:'current',period:'2026-09',periodLabel:'September 2026',
    date:'2026-09-02',files:[
      {id:'f9',name:'Summit Builders — September 2026.pdf',periodLabel:'September 2026',date:'2026-09-02'},
      {id:'f8',name:'Summit Builders — August 2026.pdf',periodLabel:'August 2026',date:'2026-08-04'}]}];`;
b.run(setup + "EXTERNAL=false;IS_ADMIN=true;ME_COMPANY='Fidevia';SCHED_OPEN_CO='';");
await b.run("renderScheduleUploads()");
{
  const out=b.run("document.getElementById('sched-uploads').innerHTML");
  ok(/Show 2 schedules on file/.test(out), 'the row says how many are on file');
  ok(!/f9/.test(out), 'without listing them until asked');
  ok(!/Documents/.test(out) || /rather than in Documents/.test(out),
     'and no longer sends the reader to Documents to find them');
}
b.run("schedToggleFiles('Summit Builders')");
await b.run("renderScheduleUploads()");
{
  const out=b.run("document.getElementById('sched-uploads').innerHTML");
  ok(/openBoxFile\('f9'/.test(out) && /openBoxFile\('f8'/.test(out), 'expanding lists every one');
  ok(/Covers August 2026/.test(out) && /submitted 08\/04\/2026/.test(out),
     'each with the month it covers and the day it came in');
  ok(/dl-btn|downloadBoxFile/.test(out), 'and a download beside it');
}
b.run("schedToggleFiles('Summit Builders')");
await b.run("renderScheduleUploads()");
ok(!/openBoxFile\('f9'/.test(b.run("document.getElementById('sched-uploads').innerHTML")),
   'and it closes again');
// A contract with nothing on file has nothing to expand.
b.run(setup.replace(/files:\[[\s\S]*?\]\}\]/,'files:[]}]') + "SCHED_OPEN_CO='';");
await b.run("renderScheduleUploads()");
ok(!/schedules on file/.test(b.run("document.getElementById('sched-uploads').innerHTML")),
   'a contract with nothing on file is not offered an empty list');

console.log('Running the real rule, not matching text at it');
// The assertions above read the source. These run it: the actual docsAllows
// against a stand-in Box, the same way tools-test-internal.mjs proves Fidevia
// Internal. A regex can be satisfied by code that never executes.
{
  const grab=(sig,end)=>srv.slice(srv.indexOf(sig), srv.indexOf(end));
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
  const F = new Function(pre + grab('async function docsPositionOf','const reqKey =') + `
    return { docsAllows, docsIsSchedules, docsPositionOf, set:(t,g)=>{TREE=t; GRANT=g;} };`)();
  const TREE = {
    'root':  {name:'12 - Documents', path_collection:{entries:[{name:'Ithaca'}]}},
    'sched': {name:'Schedules', path_collection:{entries:[{name:'Ithaca'},{name:'12 - Documents'}]}},
    'deep':  {name:'2026', path_collection:{entries:[{name:'Ithaca'},{name:'12 - Documents'},{name:'Schedules'}]}},
    'open':  {name:'Meeting Minutes', path_collection:{entries:[{name:'Ithaca'},{name:'12 - Documents'}]}}
  };
  const ROLES=[['contractor','Summit Builders'],['architect','Architect 2'],
               ['engineer','Next Level Engineers'],['owner','Ithaca']];
  for (const [role, company] of ROLES){
    F.set(TREE, {company, role});
    ok(!(await F.docsAllows({}, '', [], {isAdmin:false}, 'sched')),
       'a '+role+' cannot reach Schedules through Documents');
    ok(!(await F.docsAllows({}, '', [], {isAdmin:false}, 'deep')),
       'nor anything nested inside it, as a '+role);
    ok(await F.docsAllows({}, '', [], {isAdmin:false}, 'open'),
       'while the rest of Documents still opens for a '+role);
  }
  ok(F.docsIsSchedules(await F.docsPositionOf({}, 'sched'))===true,
     'and the folder is recognised by position, not by whatever it is called deeper down');
  ok(F.docsIsSchedules(await F.docsPositionOf({}, 'open'))===false,
     'so an unrelated folder is not swept up with it');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-schedtab.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
