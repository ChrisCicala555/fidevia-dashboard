// Daily reports and certified payrolls arrive every day and every week, and
// they arrived into one folder per contractor. A year in, that is four hundred
// files in a list nobody can find anything in.
//
// So each contractor's folder gets a folder per month, seeded from the month
// the project started owing paperwork and extended as months pass, and a report
// is filed under the month it is FOR — not the month somebody got round to
// uploading it.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const P = bootPage();
P.run(SEED);
const call = (expr) => P.run(expr);

console.log('Naming a month');
ok(call(`monthFolderName('2026-09')`)==='2026-09 September',
   'sorts by number and reads in words, so Box orders it and a person can scan it');
ok(call(`monthFolderName('2026-10')`) > call(`monthFolderName('2026-09')`),
   'and October sorts after September, which "October"/"September" alone would not');
ok(call(`monthFolderName('')`)==='' && call(`monthFolderName('September')`)==='',
   'a name it cannot parse yields none rather than a folder called undefined');
ok(call(`ymOf('2026-09-30')`)==='2026-09' && call(`ymOf('2026-10-01')`)==='2026-10',
   'a date resolves to its own month, not the one the clock is in');
ok(call(`ymOf('')`)==='' && call(`ymOf('not a date')`)==='', 'and a non-date resolves to nothing');

console.log('Which months to make');
ok(call(`JSON.stringify(monthsFrom('2026-09','2026-12'))`)
   === JSON.stringify(['2026-09','2026-10','2026-11','2026-12']),
   'every month from the start through now');
ok(call(`JSON.stringify(monthsFrom('2026-11','2027-02'))`)
   === JSON.stringify(['2026-11','2026-12','2027-01','2027-02']),
   'counting over a year end');
ok(call(`JSON.stringify(monthsFrom('2026-09','2026-09'))`) === JSON.stringify(['2026-09']),
   'a project that started this month gets this month');
ok(call(`monthsFrom('2026-12','2026-09').length`)===0,
   'and an end before the start gets nothing, rather than looping to the cap');
ok(call(`monthsFrom('','2026-09').length`)===0 && call(`monthsFrom('2026-09','').length`)===0,
   'as does a missing bound');
ok(call(`monthsFrom('1990-01','2026-09').length`)<=120,
   'a wrong date from years back cannot ask Box for hundreds of folders');

console.log('When the filing starts');
// SEED has no Notice to Proceed, so this exercises the fallback first.
ok(call(`projectStartYM()`)==='2026-01', 'with no milestones, the contract date');
call(`currentProject.config.milestones.push({name:'Notice to Proceed', contract:'2026-03-15'})`);
ok(call(`projectStartYM()`)==='2026-03', 'Notice to Proceed once there is one — that is when paperwork is owed');
call(`currentProject.config.milestones.push({name:'Mobilize', contract:'2026-02-01'})`);
ok(call(`projectStartYM()`)==='2026-02',
   'and mobilization if it came first, because crews on site file daily reports');
{
  // The same answer the schedule panel gives. Two definitions of "the project
  // has started" would drift, and one of them would be wrong.
  const a = call(`(function(){const d=scheduleObligationStart();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');})()`);
  ok(a===call(`projectStartYM()`), 'which is the same start the schedule reminders use');
}
{
  // new Date('2026-02-01') is UTC midnight, which is the 31st of January in
  // every US timezone. A milestone on the 1st must not resolve to the month
  // before, or the folders start a month early and the chase starts a day early.
  call(`currentProject.config.milestones=currentProject.config.milestones.filter(m=>!/notice|mobil/i.test(m.name))`);
  call(`currentProject.config.milestones.push({name:'Notice to Proceed', contract:'2026-06-01'})`);
  ok(call(`projectStartYM()`)==='2026-06', 'a start on the 1st of a month is that month, not the one before');
  ok(call(`ymOf('2026-06-01')`)==='2026-06', 'and so is a report dated the 1st, which files it in the right folder');
  ok(call(`(function(){const d=scheduleObligationStart();return d.getDate()+'/'+(d.getMonth()+1);})()`)==='1/6',
     'the schedule chase reads the same day, rather than the evening before');
}
call(`currentProject.config.milestones=currentProject.config.milestones.filter(m=>!/notice|mobil/i.test(m.name))`);

console.log('Making them');
const stub = `
  MADE=[]; LISTED=[]; EXISTING={};
  MONTHS_DONE={};
  boxList = async (id)=>{ LISTED.push(id); return (EXISTING[id]||[]).map(nm=>({type:'folder',name:nm})); };
  findOrCreateFolder = async (name,parent)=>{ MADE.push(parent+'/'+name); return parent+'/'+name; };
`;
call(stub);
call(`currentProject.config.milestones.push({name:'Notice to Proceed', contract:ymOf(new Date())+'-01'})`);
await call(`ensureMonthFolders('contractor_daily')`);
ok(call(`MADE.filter(x=>x==='13/Summit Builders').length`)===1,
   'the contractor folder is made under the module folder');
ok(call(`MADE.some(x=>x==='13/Summit Builders/'+monthFolderName(ymOf(new Date())))`),
   'with this month inside it');
call(`MADE=[]`);
await call(`ensureMonthFolders('contractor_daily')`);
ok(call(`MADE.length`)===0, 'and a second render does not ask Box for all of them again');

console.log('Only the missing ones');
call(stub);
call(`currentProject.config.milestones=currentProject.config.milestones.filter(m=>!/notice/i.test(m.name))`);
call(`currentProject.config.milestones.push({name:'Notice to Proceed', contract:'2026-07-04'})`);
call(`EXISTING['14/Summit Builders']=[monthFolderName('2026-07'), monthFolderName('2026-08')]`);
await call(`ensureMonthFolders('payrolls')`);
{
  const made = JSON.parse(call(`JSON.stringify(MADE)`));
  ok(!made.includes('14/Summit Builders/'+call(`monthFolderName('2026-07')`)),
     'a month that is already there is left alone');
  ok(made.includes('14/Summit Builders/'+call(`monthFolderName('2026-09')`)),
     'and one that is not is created');
  ok(made.filter(x=>x==='14/Summit Builders').length===1,
     'the company folder is resolved once, not once per month');
}

console.log('Who does the seeding, and what happens when it fails');
call(stub);
call(`MONTHS_DONE={}; EXTERNAL=true; VIEW_AS='contractor';`);
await call(`ensureMonthFolders('contractor_daily')`);
ok(call(`MADE.length`)===0,
   'a contractor does not reorganize the project record — Fidevia keeps the filing');
call(`EXTERNAL=false; VIEW_AS=null; MONTHS_DONE={};`);
call(`findOrCreateFolder = async ()=>{ throw new Error('Box down'); }`);
let threw=false;
try{ await call(`ensureMonthFolders('payrolls')`); }catch(e){ threw=true; }
ok(!threw, 'Box being unreachable does not break the page that was only rendering a table');
ok(call(`MONTHS_DONE['900:payrolls']`)!==true,
   'and it is not marked done, so the next render tries again');
call(`MONTHS_DONE={}`);
call(stub);
await call(`ensureMonthFolders('rfi')`);
await call(`ensureMonthFolders('pay_apps')`);
ok(call(`MADE.length`)===0, 'and no other module grows month folders it never asked for');

console.log('Filing an upload into the right month');
{
  const c = html.split("if(MONTH_MODULES.includes(key) && uploadFolderId){")[1].split('      }\n')[0];
  ok(/v\('f-date-sub'\) \|\| v\('f-week'\)/.test(c),
     'the month comes from the report’s own date, or the week it ends');
  ok(/\|\| etToday\(\)/.test(c), 'falling back to today only when the form gave neither');
  ok(/parentId:uploadFolderId/.test(c) && /findOrCreateFolder\(_mf, uploadFolderId\)/.test(c),
     'and it nests inside the company folder rather than replacing it');
  ok(/if\(_mf\)/.test(c), 'a date that will not parse files at company level, not in a folder called NaN');
}
ok(/MONTH_MODULES=\['contractor_daily','payrolls'\]/.test(html),
   'only daily reports and payrolls are filed by month; pay applications keep their own numbering');
{
  // A week of reports uploaded together shares the one date typed on the form,
  // so the folder has to be settled before the loop rather than inside it.
  const body = html.split('const BATCH_FORMS=')[1];
  ok(body.indexOf('MONTH_MODULES.includes(key)') < body.indexOf('const _files=[...fi.files]'),
     'a batch is filed into one month, resolved once before the files are sent');
}
{
  const map = html.match(/const keyMap=\{[^}]*\}/)[0];
  ok(/cdaily_ext:'contractor_daily'/.test(map) && /payroll:'payrolls'/.test(map),
     'and the contractor’s own upload forms reach those same two modules');
}

console.log('Certified Payrolls moved to Recordkeeping');
{
  const nav = html.split('<div class="nav-section-label">Recordkeeping</div>')[1].split('<div class="sidebar-footer">')[0];
  const rec = nav.split('<div class="nav-section-label">Financial Management</div>')[0];
  const fin = nav.split('<div class="nav-section-label">Financial Management</div>')[1]||'';
  ok(/data-section="payrolls"/.test(rec), 'it sits under Recordkeeping');
  ok(!/data-section="payrolls"/.test(fin), 'and no longer under Financial Management');
  ok(rec.indexOf('data-section="cdaily"') < rec.indexOf('data-section="payrolls"'),
     'directly after Contractor Daily Reports, which the same person uploads on the same visit');
  ok((html.match(/data-section="payrolls"/g)||[]).length===1, 'and only once');
  // Owner visibility is decided by owner-ok, not by which heading a row is
  // under, so the move must not have quietly granted or removed anything.
  const item = html.match(/<div class="nav-item[^"]*" data-section="payrolls">/)[0];
  ok(!/owner-ok/.test(item), 'carrying the same classes it had before, so nobody gained or lost sight of it');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-monthfolders.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
