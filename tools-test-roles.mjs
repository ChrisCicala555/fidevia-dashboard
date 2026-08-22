import { execSync } from 'child_process';
execSync('node tools-extract-filters.mjs');
const { filterCsvForCaller, normRole, seesAllCompanies, roleMayWrite } = await import('./.filters.tmp.mjs');

let pass=0, fail=0;
const ck=(n,c,x='')=>{ (c?pass++:fail++); console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:'')); };
const rows = t => t.trim().split('\n').slice(1).filter(Boolean);

const pay = ['App #,Contractor,Requested Amount,Attachment File ID',
 'PA-001,Summit Builders,950000,111',
 'PA-001,Voltage Electric,320000,222',
 'PA-002,Comfort Systems,45000,333'].join('\n')+'\n';

const daily = ['Date,Company,Work Performed,Attachment File ID',
 '2026-08-19,Summit Builders,Steel erection,444',
 '2026-08-19,Voltage Electric,Panel rough-in,555'].join('\n')+'\n';

const rfi = ['RFI #,Subject,Status','RFI-001,Window flashing,Open'].join('\n')+'\n';

console.log('Contractor — sees only its own company');
ck('own pay app only', rows(filterCsvForCaller('Payment Applications.csv',pay,false,'Summit Builders','contractor')).length===1);
ck('cannot see another contractor', !filterCsvForCaller('Payment Applications.csv',pay,false,'Summit Builders','contractor').includes('222'));
ck('own daily reports only', rows(filterCsvForCaller('Contractor Daily Reports.csv',daily,false,'Summit Builders','contractor')).length===1);

console.log('\nArchitect/Engineer — reviews the whole project');
ck('sees ALL pay apps', rows(filterCsvForCaller('Payment Applications.csv',pay,false,'Draper & Associates','architect-engineer')).length===3);
ck('sees ALL daily reports', rows(filterCsvForCaller('Contractor Daily Reports.csv',daily,false,'Draper & Associates','architect-engineer')).length===2);
ck('sees RFIs', rows(filterCsvForCaller('RFI Log.csv',rfi,false,'Draper & Associates','architect-engineer')).length===1);
ck('may write', roleMayWrite('architect-engineer')===true);

console.log('\nOwner — read-only, financial modules only');
ck('sees ALL pay apps', rows(filterCsvForCaller('Payment Applications.csv',pay,false,'Lancaster SD','owner')).length===3);
ck('blocked from RFIs', rows(filterCsvForCaller('RFI Log.csv',rfi,false,'Lancaster SD','owner')).length===0, '<-- server-side, not just hidden nav');
ck('blocked from contractor daily reports', rows(filterCsvForCaller('Contractor Daily Reports.csv',daily,false,'Lancaster SD','owner')).length===0);
ck('may NOT write', roleMayWrite('owner')===false);
ck('blocked module keeps its header row', filterCsvForCaller('RFI Log.csv',rfi,false,'x','owner').startsWith('RFI #,Subject,Status'));

console.log('\nFidevia admin — unaffected');
ck('admin sees everything', rows(filterCsvForCaller('Payment Applications.csv',pay,true,'','')).length===3);
ck('admin reaches RFIs', rows(filterCsvForCaller('RFI Log.csv',rfi,true,'','')).length===1);

console.log('\nRole normalisation — legacy free-text values');
ck('"Architect" maps to A/E', normRole('Architect')==='architect-engineer');
ck('"Engineer" maps to A/E', normRole('MEP Engineer')==='architect-engineer');
ck('"Owner" maps to owner', normRole('Owner')==='owner');
ck('"General Contractor" maps to contractor', normRole('General Contractor')==='contractor');
ck('unknown defaults to contractor', normRole('')==='contractor', '(safest: own company only)');
ck('A/E and Owner see all companies', seesAllCompanies('architect-engineer') && seesAllCompanies('owner'));
ck('contractor does not', seesAllCompanies('contractor')===false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
