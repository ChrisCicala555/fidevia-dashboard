// Who sees the Monthly Schedules panel. The server was taught this when
// schedules left Documents — a contract reads its own, Fidevia and the owner
// and the design team read all of them — and the panel was not. So the
// architect, who had just been given access to read programmes, opened the
// Schedule tab and could not see that the panel existed.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const FILES=[{id:'a',name:'Summit Builders — September 2026.jpg',periodLabel:'September 2026',date:'2026-09-08'}];
const view=async(email,co,role,ext,adm)=>{
  b.run(`currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'1',active:true},
    {name:'Gorilla Construction',role:'PC',contract:'1',active:true}];
    SCHED_FOLDER_ID='555'; DATA_READY=true; SCHED_OPEN_CO='';
    EXTERNAL=${ext}; IS_ADMIN=${adm}; ME_EMAIL='${email}'; ME_COMPANY='${co}';
    currentProject.userCompany='${co}'; currentProject.userRole='${role}';
    document.body.className='${ext?"external-mode":"is-admin"}';
    SCHED_UPLOADS=[{company:'Summit Builders',state:'current',period:'2026-09',periodLabel:'September 2026',
      date:'2026-09-08',files:${JSON.stringify(FILES)}},
     {company:'Gorilla Construction',state:'never',files:[]}];`);
  await b.run("renderScheduleUploads()");
  const h=b.run("document.getElementById('sched-uploads').innerHTML");
  return {shown: b.run("document.getElementById('sched-uploads-panel').style.display")==='',
          html: h,
          contracts: (h.match(/<strong>([^<]+)<\/strong>/g)||[]).map(x=>x.replace(/<[^>]+>/g,'')),
          upload: /openSchedUpload\(/.test(h), remind: /sendScheduleChaseNow/.test(h),
          update: /Update<\/button>/.test(h)};
};

console.log('The design team can read them');
for(const [role,co,email] of [['architect','Architect 2','a@x.test'],['engineer','Next Level Engineers','p@y.test']]){
  const v=await view(email,co,role,true,false);
  ok(v.shown, 'the '+role+' sees the panel at all');
  ok(v.contracts.length===2, 'and every contract on the job, not just one ('+v.contracts.join(', ')+')');
  ok(/openBoxFile\('a'/.test(v.html), 'with the programmes openable');
  ok(!v.upload && !v.update, 'but nothing to post — they review a programme, they do not hold one');
  ok(!v.remind, 'and no chasing, which is Fidevia’s');
}
{
  const v=await view('o@i.test','Ithaca','owner',true,false);
  ok(v.shown && v.contracts.length===2, 'the owner reads them too');
  ok(!v.upload && !v.update && !v.remind, 'read-only, as everywhere else');
}

console.log('Everyone else is unchanged');
{
  const f=await view('cc@fidevia.com','Fidevia','',false,true);
  ok(f.shown && f.contracts.length===2 && f.upload && f.remind,
     'Fidevia keeps every contract, the upload and the chase');
  const gc=await view('gc@s.test','Summit Builders','contractor',true,false);
  ok(gc.shown && gc.contracts.length===1 && gc.contracts[0]==='Summit Builders',
     'a contractor still sees only their own contract');
  ok(gc.upload && gc.update, 'and can still post and replace one');
  ok(!gc.remind, 'without being able to chase themselves');
  const none=await view('x@y.test','','contractor',true,false);
  ok(!none.shown, 'and somebody with no contract on the job is shown nothing');
}

console.log('What each is told');
{
  const a=await view('a@x.test','Architect 2','architect',true,false);
  ok(/Every prime contractor.{0,8}s current programme/.test(a.html),
     'the reviewer is told what they are looking at');
  ok(!/Upload the current programme here each month/.test(a.html),
     'rather than asked for something they do not owe');
  const gc=await view('gc@s.test','Summit Builders','contractor',true,false);
  ok(/Upload the current programme here each month/.test(gc.html),
     'while the contract that owes one is asked for it');
}

console.log('Client and server agree');
ok(/const readsAll = isFidevia \|\| DESIGN_ROLES\.includes\(viewingAsRole\(\)\) \|\| isOwnerView\(\)/.test(html),
   'the panel reads the same three-way split the server enforces');
ok(/if \(!seesAllCompanies\(normRole\(g\.role\)\)\) \{/.test(srv),
   'which the server decides with seesAllCompanies');
ok(/const mayPost = !readsAll \|\| isFidevia;/.test(html),
   'and reading is kept separate from being asked to post');

console.log((bad?'FAIL ':'ok   ')+'tools-test-schedroles.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
