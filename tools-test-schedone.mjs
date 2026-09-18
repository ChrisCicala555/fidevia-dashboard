// Chasing one contract for its schedule, without writing to the firms that are
// already current.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// Run the real thing.
// Starts at the not-ready helpers rather than at schedChaseTargets: deciding
// that a project without a Schedules folder is not a contractor who is late
// is part of the chase rules, and running the rest without them ran nothing.
const a = html.indexOf('const SCHED_NOT_READY=');
const b = html.indexOf('function scheduleStats()');
const pre = `function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDMY(v){ if(!v) return ''; const m=String(v).match(/^(\\d{4})-(\\d{2})-(\\d{2})/); return m?(m[2]+'/'+m[3]+'/'+m[1]):String(v); }
let SCHED_UPLOADS=null,SCHED_LAST_SEND=null,allData={contacts:[]},IS_ADMIN=true;
function viewingAsExternal(){return false;}
`;
const H = new Function(pre + html.slice(a,b) +
  '\nreturn {set:(u,l,c)=>{SCHED_UPLOADS=u;SCHED_LAST_SEND=l;allData.contacts=c;},' +
  'schedChaseTargets,schedChaseSendable,schedChaseFooter,schedRowRemind,schedLastFor,schedNearMiss};')();
const strip = x => x.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

// 'stale' rather than 'no-schedules-folder': these are contracts that are LATE,
// which is what a chase is for. A project with no Schedules folder is Fidevia
// not having finished setting it up, and nobody is chased for that — checked
// at the foot of this file.
const FOUR = [
  {company:'Summit Builders', state:'current', date:'2026-09-07'},
  {company:'Comfort Systems', state:'stale'},
  {company:'AH Plumbing',     state:'stale'},
  {company:'Voltage Electric',state:'stale'}
];
H.set(FOUR, null, [
  {Company:'Summit Builders', Email:'d@summit.com'},
  {Company:'Comfort Systems', Email:'ops@comfort.com'},
  {Company:'Comfort Systems', Email:'pm@comfort.com'},
  {Company:'AH Plumbing',     Email:'joe@ahp.com'}
]);
const t = c => H.schedChaseTargets().find(x=>x.company===c);
ok(H.schedChaseTargets().length===3, 'only the contracts behind are targets');
ok(!H.schedChaseTargets().some(x=>x.company==='Summit Builders'),
   'a contract that has posted one is never written to');
ok(t('Voltage Electric') && t('Voltage Electric').emails.length===0,
   'a contract with nobody to write to is still listed, so its row can say why');
ok(H.schedChaseSendable().length===2, 'but it is not sendable');
ok(t('Comfort Systems').emails.length===2, 'everyone at a company is written to');

// ── the per-row control ──
ok(/sendScheduleChaseNow\(/.test(H.schedRowRemind(t('Comfort Systems'))), 'each row carries its own button');
ok(H.schedRowRemind(t('Comfort Systems')).indexOf('Comfort Systems')>=0, 'naming its own company');
ok(/disabled/.test(H.schedRowRemind(t('Voltage Electric'))), 'unreachable contracts cannot be pressed');
ok(!/disabled/.test(H.schedRowRemind(t('Comfort Systems'))), 'reachable ones can');
ok(/event\.stopPropagation\(\)/.test(H.schedRowRemind(t('AH Plumbing'))), 'pressing it does not also toggle the row');

// ── the bulk control steps back ──
ok(/btn-sched-chase/.test(H.schedChaseFooter()), 'with several behind there is a Remind All');
ok(/Remind All 2/.test(H.schedChaseFooter()), 'which says how many it would write to');
H.set([FOUR[0], FOUR[2]], null, [{Company:'AH Plumbing', Email:'joe@ahp.com'}]);
ok(!/btn-sched-chase/.test(H.schedChaseFooter()),
   'with one behind there is no bulk button at all — its own row has one');
ok(/use the button on its row/.test(strip(H.schedChaseFooter())), 'and the footer says so');
H.set([FOUR[0]], null, []);
ok(/nobody to chase/.test(strip(H.schedChaseFooter())), 'with none behind it says so');

// ── the stamp is per company ──
H.set(FOUR, {perCompany:{'Comfort Systems':{at:'2026-09-07T14:02:00Z', by:'chris@fidevia.com'}}},
  [{Company:'Comfort Systems',Email:'ops@comfort.com'},{Company:'AH Plumbing',Email:'joe@ahp.com'}]);
ok(!!H.schedLastFor('Comfort Systems'), 'the reminded company is stamped');
ok(!H.schedLastFor('AH Plumbing'), 'and reminding one does not mark the others');
ok(!!H.schedLastFor('comfort systems'), 'the lookup does not care about case');
ok(/Remind again/.test(H.schedRowRemind(t('Comfort Systems'))), 'a second press reads as a second press');
ok(/>Remind</.test(H.schedRowRemind(t('AH Plumbing'))), 'while an unchased contract still reads as the first');

// ── why a button is dead ──
H.set(FOUR, null, [{Company:'Comfort Systems Inc', Email:'ops@comfort.com'}]);
ok(H.schedNearMiss('Comfort Systems')==='Comfort Systems Inc',
   'a contract named differently from the contact sheet is recognised');
ok(H.schedNearMiss('Voltage Electric')==='', 'and genuinely absent contacts are not mistaken for it');
ok(H.schedRowRemind(t('Comfort Systems')).indexOf('have to match')>=0,
   'the tooltip names both spellings rather than saying nobody has an email');
ok(/do not match the contact sheet/.test(strip(H.schedChaseFooter())),
   'and the footer says it without needing a hover');
H.set([{company:'Voltage Electric',state:'never'}], null, [{Company:'Summit Builders',Email:'a@b.com'}]);
ok(/have anyone with an email address/.test(strip(H.schedChaseFooter())),
   'a real absence still reads as an absence');

// ── the send ──
{
  const c = html.split('async function sendScheduleChaseNow(company)')[1].split('function scheduleStats')[0];
  ok(/const only=String\(company\|\|''\)\.trim\(\)/.test(c), 'the send takes one company');
  ok(/if\(only\) targets=targets\.filter/.test(c), 'and narrows to it');
  ok(/schedChaseSendable\(\)/.test(c), 'never trying to write to a contract with no addresses');
  ok(/if\(!targets\.length\) return;/.test(c), 'nor to nobody');
  ok(/confirm\(/.test(c), 'the list is confirmed first');
  ok(/document\.querySelectorAll\('\.sched-remind, #btn-sched-chase'\)/.test(c),
     'every send control is disabled while one runs, so two cannot overlap');
  ok(/SCHED_LAST_SEND\.perCompany\[t\.company\]=/.test(c),
     'a stamp that failed to save is still recorded locally, so a sent reminder does not invite a second');
  ok(/Reminded '\+targets\.map\(t=>t\.company\)/.test(c), 'and the result names who was reminded');
}
// ── the server keeps it per company ──
{
  const c = srv.split("if (op === 'recordScheduleSend')")[1].split('// ---- NOTIFICATION LOG ----')[0];
  ok(/perCompany/.test(c), 'the stamp is stored per company');
  ok(/Object\.assign\(\{\}, prev\.perCompany \|\| \{\}\)/.test(c),
     'and reminding one preserves what was recorded for the others');
  ok(/by: who\.email/.test(c), 'the sender is the caller the server verified');
  ok(/slice\(0, 120\)/.test(c) && /slice\(0, 60\)/.test(c), 'bounded in both name length and count');
}


// ── a project that is not set up is not a contractor who is late ──
{
  H.set([
    {company:'LA Building Contractors', state:'no-schedules-folder'},
    {company:'Garden Spot Mechanical',  state:'no-schedules-folder'},
    {company:'Cook\u2019s Service Company', state:'no-documents'}
  ], null, [
    {Company:'LA Building Contractors', Email:'a@la.test'},
    {Company:'Garden Spot Mechanical',  Email:'b@gs.test'}
  ]);
  ok(H.schedChaseTargets().length===0,
     'nobody is chased for failing to upload into a folder that does not exist');
  ok(H.schedChaseSendable().length===0, 'and there is nothing to send');
  const f=strip(H.schedChaseFooter());
  ok(/no Schedules folder yet/.test(f), 'the panel says what is actually wrong');
  ok(/Bring It Up To Date/.test(f), 'and who fixes it, and how');
  ok(!/Remind All/.test(H.schedChaseFooter()),
     'and offers no bulk reminder \u2014 three contractors chased for Fidevia\u2019s setup is the '
     +'one thing this panel must not do');
}

console.log((bad?'FAIL':'ok  '),' tools-test-schedone.mjs —',n,'assertions');
process.exit(bad?1:0);
