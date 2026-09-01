// Pay applications were numbered by hand, and contractor uploads arrived with
// no number at all. Numbering runs per contractor: Summit's App 7 has nothing
// to do with Comfort's App 3.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

fs.writeFileSync('.pn.tmp.mjs', [
  "export let allData={};",
  "export let currentProject={config:{contractors:[]}};",
  "export function setContractors(cs){ currentProject.config.contractors=cs; }",
  "export function seed(k,rows){ allData[k]=rows; }",
  grab('function rowCompany'),
  grab('function nextItemNumber(key, comp)'), grab('function nextItemNumberByCompany'),
  grab('function tradeCodeFor'), grab('function contractorRec'),
  "const FIDEVIA_EMAIL=/@fidevia\\.com$/i; const DESIGN_ROLES=['architect','engineer'];",
  "const PROJECT_ROLES={};",
  "export { nextItemNumber, rowCompany };"
].join('\n'));
const { nextItemNumber, seed, setContractors } = await import('./.pn.tmp.mjs');

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

console.log('First application');
seed('pay_apps',[]);
ok('starts at 001', nextItemNumber('pay_apps','Summit Builders')==='PA-001_Summit Builders');

console.log('Sequence is per contractor');
seed('pay_apps',[
  {'App #':'PA-001_Summit Builders', Contractor:'Summit Builders'},
  {'App #':'PA-002_Summit Builders', Contractor:'Summit Builders'},
  {'App #':'PA-001_Comfort Systems', Contractor:'Comfort Systems'}
]);
ok('Summit continues from 002',        nextItemNumber('pay_apps','Summit Builders')==='PA-003_Summit Builders');
ok('Comfort is unaffected by Summit',  nextItemNumber('pay_apps','Comfort Systems')==='PA-002_Comfort Systems');
ok('a new contractor starts at 001',   nextItemNumber('pay_apps','AH Plumbing')==='PA-001_AH Plumbing');
ok('matching ignores case',            nextItemNumber('pay_apps','summit builders')==='PA-003_summit builders');

console.log('The firm may be in either column');
// Fidevia records these with Contractor set; contractor uploads set both.
seed('pay_apps',[{'App #':'PA-004_Summit Builders', Contractor:'Summit Builders'}]);
ok('reads Contractor when Company is absent', nextItemNumber('pay_apps','Summit Builders')==='PA-005_Summit Builders');
seed('pay_apps',[{'App #':'PA-004_Summit Builders', Company:'Summit Builders'}]);
ok('reads Company when Contractor is absent', nextItemNumber('pay_apps','Summit Builders')==='PA-005_Summit Builders');

console.log('Logs kept by hand still continue');
// Numbers typed before this existed must not be ignored, or the next issued
// number would collide with one already in the log.
for(const [v,label] of [['7','a bare number'],['No. 7','No. 7'],['#7','#7'],['PA-007','PA-007'],['PA 7','PA 7']]){
  seed('pay_apps',[{'App #':v, Contractor:'Summit Builders'}]);
  ok('continues past '+label, nextItemNumber('pay_apps','Summit Builders')==='PA-008_Summit Builders');
}
seed('pay_apps',[{'App #':'PA-002_Summit Builders', Contractor:'Summit Builders'},{'App #':'9', Contractor:'Summit Builders'}]);
ok('takes the highest across both forms', nextItemNumber('pay_apps','Summit Builders')==='PA-010_Summit Builders');

console.log('Odd input');
seed('pay_apps',[{'App #':'', Contractor:'Summit Builders'},{'App #':'draft', Contractor:'Summit Builders'}]);
ok('unnumbered rows do not break the sequence', nextItemNumber('pay_apps','Summit Builders')==='PA-001_Summit Builders');
ok('an unknown module yields nothing', nextItemNumber('nonsense','Summit Builders')==='');

console.log('Other modules now carry the trade code');
setContractors([{name:'Summit Builders', role:'GC'}]);
seed('rfi',[{'RFI #':'RFI-004_Summit Builders', Company:'Summit Builders'}]);
// The old form is read for continuity, so the run carries on rather than
// restarting, but the new number carries the trade instead of the firm.
ok('an existing RFI continues into the trade run', nextItemNumber('rfi','Summit Builders')==='RFI-GC-005');
ok('pay applications are unaffected by that change',
   nextItemNumber('pay_apps','Summit Builders').endsWith('_Summit Builders'));

console.log('Wiring');
ok('pay apps are in the pre-numbered set', /\['rfi','co','sub','pay_apps'\]\.includes\(key\)/.test(src));
ok('the number follows the contractor chosen on the form', /key==='pay_apps' && !EXTERNAL\) _pc = v\('f-contr'\)/.test(src));
ok('App # is no longer required',   !/App #, Contractor, and Requested Amount are required/.test(src));
ok('a typed number still wins',     /'App #':\(v\('f-num'\)\|\|PRE_NUM\)/.test(src));
ok('contractor uploads are numbered', /'App #':\(PRE_NUM\|\|nextItemNumber\('pay_apps',_comp\)\)/.test(src));
ok('the form renumbers when the contractor changes', /ci\.onchange=renum/.test(src));
ok('a typed number is not overwritten', /num\.dataset\.touched/.test(src));

fs.rmSync('.pn.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
