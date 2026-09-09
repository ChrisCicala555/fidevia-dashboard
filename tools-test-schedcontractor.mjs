// The contractor's monthly schedule bubble. The module was written for them —
// the render filters to their own contract, the footer explains the monthly
// obligation, the server answers them about nobody else — and the panel it all
// hangs off was marked admin-only, so none of it was ever on screen.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// The class that hid it, and what it does.
{
  const panel=html.match(/<div class="[^"]*" id="sched-uploads-panel"/);
  ok(!!panel && !/admin-only/.test(panel[0]),
     'the panel is not marked admin-only');
  ok(/body\.external-mode \.admin-only\{display:none !important;\}/.test(html),
     'because that class hides the element from every external user');
  ok(/!important/.test(html.match(/body\.external-mode \.admin-only\{[^}]*\}/)[0]),
     'with !important, so the display the render sets could not win');
}

const b = bootPage('index.html'); b.run(SEED);
b.run(`currentProject.config.contractors=[
  {name:'Summit Builders',role:'GC',contract:'2000000',active:true},
  {name:'Gorilla Construction',role:'Sub',contract:'500000',active:true}];
SCHED_FOLDER_ID='555';`);
const view = async (email,co,role,ext,admin) => {
  b.run(`EXTERNAL=${ext};IS_ADMIN=${admin};ME_EMAIL='${email}';ME_COMPANY='${co}';
    currentProject.userCompany='${co}';currentProject.userRole='${role}';DATA_READY=true;
    SCHED_UPLOADS=[{company:'Summit Builders',state:'stale',date:'2026-08-03'},
                   {company:'Gorilla Construction',state:'current',date:'2026-09-02'}];`);
  await b.run("renderScheduleUploads()");
  return {shown: b.run("document.getElementById('sched-uploads-panel').style.display")==='',
          body:  b.run("document.getElementById('sched-uploads').innerHTML")};
};

console.log('Who the bubble is for');
{
  const gc = await view('gc@s.test','Summit Builders','contractor',true,false);
  ok(gc.shown, 'a prime contractor sees the panel');
  ok(/Summit Builders/.test(gc.body), 'with their own contract on it');
  ok(/Upload<input type="file"/.test(gc.body), 'and something to upload with');
  ok(/Upload the current programme here each month/.test(gc.body),
     'and it says what is being asked of them');
  ok(!/Remind/.test(gc.body), 'chasing stays with Fidevia — reminding yourself is an odd offer');
  ok(!/Gorilla Construction/.test(gc.body), 'and they do not see a rival contract');
}
{
  const fid = await view('cc@fidevia.com','Fidevia','',false,true);
  ok(fid.shown && /Summit Builders/.test(fid.body) && /Gorilla Construction/.test(fid.body),
     'Fidevia still sees every contract');
  ok(/Remind/.test(fid.body), 'and can still chase');
}
for(const [co,role] of [['Architect 2','architect'],['Ithaca','owner'],['Next Level Engineers','engineer']]){
  const v = await view('x@y.test',co,role,true,false);
  ok(!v.shown, co+' has no contract on the job, so nothing is asked of them');
}
{
  const stranger = await view('x@y.test','Some Other Firm','contractor',true,false);
  ok(!stranger.shown, 'and neither is a company that is not a prime here');
}

console.log('The rival row');
// A real contractor could never be sent one: the server replaces whatever they
// asked for with the company on their grant. This is about the preview.
ok(/companies = \[mine\];/.test(srv), 'the server answers a contractor about their own contract only');
ok(/const shown=\(SCHED_UPLOADS\|\|\[\]\)\.filter\(r=>cos\.some/.test(html),
   'and the render draws the filtered list rather than trusting the cache');

console.log('Uploading');
ok(/const name=safeFileName\(company \+ ' \\u2014 ' \+ schedMonthLabel\(\)\)\+ext;/.test(html)
   || /safeFileName\(company\+' \\u2014 '\+schedMonthLabel\(\)\)\+ext/.test(html),
   'the file is named for the contract and the month, which is what the chase reads');
ok(/if\(!SCHED_FOLDER_ID\)\{/.test(html), 'a project with no Schedules folder says so rather than failing');
ok(/SCHED_UPLOADS=null; MY_SCHEDULE=null;/.test(html), 'and the row refreshes after an upload');

console.log((bad?'FAIL ':'ok   ')+'tools-test-schedcontractor.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
