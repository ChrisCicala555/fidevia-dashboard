// Due dates come from the contract, not from whoever is typing. RFIs follow the
// turnaround owed by whoever has to answer; submittals follow one project-wide
// review period; change orders have none.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

fs.writeFileSync('.dd.tmp.mjs', [
  "export let currentProject={config:{}}, allData={contacts:[]}, PROJECT_ROLES={};",
  "export function setup(cfg,contacts,roles){ currentProject.config=cfg||{}; allData.contacts=contacts||[]; PROJECT_ROLES=roles||{}; }",
  src.slice(src.indexOf('const RESPONSE_DEFAULT'), src.indexOf('function responseDays')),
  grab('function responseDays'), grab('function disciplineOf'),
  grab('function rfiDueDays'), grab('function parseLocalDate'), grab('function addDays'), grab('function isoDay'),
  "const OPEN_STATES=/open|pending|under review|revise/i;",
  grab('function isOverdue'),
  "export { responseDays, disciplineOf, rfiDueDays, parseLocalDate, addDays, isoDay, isOverdue };"
].join('\n'));
const M = await import('./.dd.tmp.mjs');
const { responseDays, disciplineOf, rfiDueDays, addDays, isoDay, isOverdue, setup } = M;

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

const CONTACTS=[
  {Name:'David Chen',   Email:'dchen@example.com',  Role:'Project Manager', Company:'Summit Builders'},
  {Name:'Sarah Draper', Email:'sdraper@example.com',Role:'Architect',       Company:'Draper & Associates'},
  {Name:'Aisha Rahman', Email:'arahman@k.test',     Role:'MEP Engineer',    Company:'Keystone Engineering'},
  {Name:'No Role',      Email:'norole@example.com', Role:'',                Company:'Someone'}
];
const ROLES={ 'dchen@example.com':'contractor', 'sdraper@example.com':'architect', 'arahman@k.test':'engineer' };

console.log('Defaults');
setup({}, CONTACTS, ROLES);
let d=responseDays();
ok('GC is 7',           d.gc===7);
ok('Architect is 7',    d.architect===7);
ok('Engineer is 10',    d.engineer===10);
ok('Submittal is 14',   d.submittal===14);

console.log('A project may state its own');
setup({response:{gc:5, architect:14, engineer:21, submittal:30}}, CONTACTS, ROLES);
d=responseDays();
ok('project values are used', d.gc===5 && d.architect===14 && d.engineer===21 && d.submittal===30);
setup({response:{gc:-1, architect:999, engineer:'x'}}, CONTACTS, ROLES);
d=responseDays();
ok('negative falls back',    d.gc===7);
ok('absurd falls back',      d.architect===7);
ok('non-numeric falls back', d.engineer===10);
setup({response:{gc:0}}, CONTACTS, ROLES);
ok('zero days is allowed',   responseDays().gc===0);

console.log('The granted role decides the discipline');
setup({}, CONTACTS, ROLES);
ok('a contractor is the GC',     disciplineOf('David Chen')==='gc');
ok('an architect is an architect',disciplineOf('Sarah Draper')==='architect');
ok('an engineer is an engineer', disciplineOf('Aisha Rahman')==='engineer');
ok('matching ignores case',      disciplineOf('sarah draper')==='architect');
// This is the payoff for splitting the two roles: same access, different clock.
ok('architect and engineer differ', rfiDueDays('Sarah Draper')===7 && rfiDueDays('Aisha Rahman')===10);

console.log('The legacy combined role still resolves');
setup({}, CONTACTS, {'sdraper@example.com':'architect-engineer'});
ok('architect-engineer reads as architect', disciplineOf('Sarah Draper')==='architect');

console.log('People with no grant fall back to their contact role');
setup({}, CONTACTS, {});
ok('reads "Architect" from the sheet',  disciplineOf('Sarah Draper')==='architect');
ok('reads "MEP Engineer" from the sheet',disciplineOf('Aisha Rahman')==='engineer');
ok('any other role is treated as GC',   disciplineOf('David Chen')==='gc');
ok('a blank role yields nothing',       disciplineOf('No Role')==='');
ok('an unknown name yields nothing',    disciplineOf('Nobody At All')==='');
ok('an unresolved assignee gets the shorter period', rfiDueDays('Nobody At All')===7);
ok('an unassigned RFI still gets a period', rfiDueDays('')===7);

console.log('Date arithmetic');
ok('adds days',            isoDay(addDays('2026-08-25', 7))==='2026-09-01');
ok('crosses a month end',  isoDay(addDays('2026-08-28', 10))==='2026-09-07');
ok('crosses a year end',   isoDay(addDays('2026-12-28', 7))==='2027-01-04');
ok('handles a leap year',  isoDay(addDays('2024-02-26', 4))==='2024-03-01');
ok('zero days is the same day', isoDay(addDays('2026-08-25', 0))==='2026-08-25');
ok('a bad date yields nothing', addDays('not a date', 7)===null);
// The reason this needs its own parser: new Date('2026-08-25') is UTC midnight,
// which is the 24th in every US timezone.
ok('an ISO date keeps its day in a western timezone', isoDay(addDays('2026-08-25', 0))==='2026-08-25');
ok('and after arithmetic',                            isoDay(addDays('2026-08-25', 1))==='2026-08-26');


console.log('Overdue');
const past='2020-01-01', future='2099-01-01';
ok('an open RFI past its date is overdue',      isOverdue({Status:'Open', 'Due Date':past})===true);
// This used to require a status of exactly "open", so a submittal sitting at
// "Pending Review" past its date never showed as late.
ok('a pending submittal past its date is overdue', isOverdue({Status:'Pending Review','Due Date':past})===true);
ok('under review counts too',                   isOverdue({Status:'Under Review','Due Date':past})===true);
ok('revise and resubmit counts too',            isOverdue({Status:'Revise and Resubmit','Due Date':past})===true);
ok('a closed item is never overdue',            isOverdue({Status:'Closed','Due Date':past})===false);
ok('an approved item is never overdue',         isOverdue({Status:'Approved','Due Date':past})===false);
ok('a future date is not overdue',              isOverdue({Status:'Open','Due Date':future})===false);
ok('no date is not overdue',                    isOverdue({Status:'Open','Due Date':''})===false);

console.log('Wiring');
ok('change orders still have no due date', !/co:\{title[\s\S]{0,1400}id="f-due"/.test(src));
ok('the submittal log carries a due date', /'Reviewer','Date Submitted','Due Date','Status'/.test(src));
ok('the submittal form offers one',        html.includes('id="f-sub-due"'));
ok('the RFI due date is no longer required', !/Due Date is required/.test(src));
ok('the RFI form recalculates on assignee change', /if\(sel\)\{ sel\.onchange=redue/.test(src));
ok('a typed date is respected',            /due\.dataset\.touched/.test(src));
ok('the wizard collects all four periods',
   ['np-rsp-gc','np-rsp-arch','np-rsp-eng','np-rsp-sub'].every(id=>html.includes('id="'+id+'"')));
ok('they can be edited later',
   ['bl-rsp-gc','bl-rsp-arch','bl-rsp-eng','bl-rsp-sub'].every(id=>html.includes('id="'+id+'"')));
ok('owner payment is gone entirely', !/ownerPay/i.test(src) && !html.includes('Owner payment'));

fs.rmSync('.dd.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
