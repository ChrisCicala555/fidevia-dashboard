// A signup is the authority on the person's own name and number. It is not the
// authority on which contract they sit under.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const dm   = html.slice(html.indexOf('function dirMismatches(r){'),
                        html.indexOf('// Fields the account holder is the authority on.'));
const core = html.slice(html.indexOf('// Fields the account holder is the authority on.'),
                        html.indexOf('async function adoptDirValue'));
const pre = `
function normCmp(v){ return String(v==null?'':v).replace(/\\s+/g,' ').trim().toLowerCase(); }
function normPhone(v){ return String(v==null?'':v).replace(/[^0-9]/g,''); }
const DIR_COMPARE=[['Company','company'],['Name','name'],['Phone','phone']];
let IS_ADMIN=true, ACCOUNTS_LOADED=true, ACCOUNT_PROFILES={}, allData={contacts:[]};
let currentProject={folderId:'1', folders:{contacts:'c'}};
const MODULES={contacts:{log:'Job Contacts.csv',headers:['Name','Company','Role','Email','Phone']}};
let EXT=false; function viewingAsExternal(){return EXT;}
let WROTE=null;
async function findFile(){ return {id:'f1'}; }
async function boxUploadText(nm,t){ WROTE=t; }
function toCSV(h,rows){ return JSON.stringify(rows); }
function renderContacts(){} function renderAll(){} function auditLog(){}
`;
const H = new Function(pre + dm + core + `
return {reconcileContactsWithAccounts, contactCompanyConflicts,
  set:(rows,profs,opts)=>{allData.contacts=rows;ACCOUNT_PROFILES=profs;RECONCILED_FOR='';WROTE=null;
    IS_ADMIN=!(opts&&opts.notAdmin); EXT=!!(opts&&opts.ext);},
  wrote:()=>WROTE, rows:()=>allData.contacts};`)();

const PROF = {'d@s.com':{name:'David Chen', company:'Summit Builders', phone:'5559990000'}};
const row  = o => Object.assign({Name:'',Company:'',Role:'',Email:'d@s.com',Phone:''}, o);

// ── what the account owns ──
H.set([row({Name:'Dave Chen', Company:'Summit Builders', Phone:'(555) 123-4567'})], PROF);
await H.reconcileContactsWithAccounts();
ok(H.rows()[0].Name==='David Chen', 'the name the person signed up with wins');
ok(H.rows()[0].Phone==='5559990000', 'and so does their number');
ok(H.rows()[0].Company==='Summit Builders', 'the contract they sit under is untouched');
ok(H.wrote()!==null, 'the sheet is written once something changed');

// ── what it does not own ──
H.set([row({Name:'David Chen', Company:'Summit Builders', Phone:'5559990000'})],
      {'d@s.com':{name:'David Chen', company:'Chen Consulting LLC', phone:'5559990000'}});
await H.reconcileContactsWithAccounts();
ok(H.rows()[0].Company==='Summit Builders',
   'a self-reported company is never adopted: it is how the directory groups people and how the schedule reminder finds them');
ok(H.wrote()===null, 'and nothing is written for it');
const cc = H.contactCompanyConflicts();
ok(cc.length===1 && cc[0].theirs==='Chen Consulting LLC', 'it is raised instead');
ok(cc[0].mine==='Summit Builders', 'naming both sides so the reader can judge');

// ── restraint ──
H.set([row({Name:'Someone Else', Company:'X', Email:'nobody@x.com', Phone:'5551112222'})], PROF);
await H.reconcileContactsWithAccounts();
ok(H.wrote()===null && H.rows()[0].Name==='Someone Else',
   'a contact with no account is left entirely alone');

H.set([row({Name:'Dave Chen', Phone:'5551234567'})], {'d@s.com':{name:'', company:'', phone:''}});
await H.reconcileContactsWithAccounts();
ok(H.wrote()===null && H.rows()[0].Name==='Dave Chen',
   'an empty profile field is a gap, not a disagreement, and overwrites nothing');

H.set([row({Name:'David Chen', Phone:'(555) 999-0000'})], PROF);
await H.reconcileContactsWithAccounts();
ok(H.wrote()===null, 'the same number written differently is not a change');
ok(H.rows()[0].Phone==='(555) 999-0000', 'so the formatting on the sheet survives');

H.set([row({})], PROF);
await H.reconcileContactsWithAccounts();
ok(H.rows()[0].Name==='David Chen' && H.rows()[0].Phone==='5559990000',
   'a blank on the sheet is filled from the account');

// ── it must not fight the person using it ──
H.set([row({Name:'Dave Chen', Phone:'1'})], PROF);
await H.reconcileContactsWithAccounts();
H.rows()[0].Name='Manually Renamed';
await H.reconcileContactsWithAccounts();
ok(H.rows()[0].Name==='Manually Renamed',
   'it runs once per project, so an edit made afterwards is not undone underneath the person making it');

// ── who may do it ──
H.set([row({Name:'Dave Chen'})], PROF, {notAdmin:true});
await H.reconcileContactsWithAccounts();
ok(H.wrote()===null, 'only Fidevia writes the contact sheet');
H.set([row({Name:'Dave Chen'})], PROF, {ext:true});
await H.reconcileContactsWithAccounts();
ok(H.wrote()===null, 'and not while previewing the project as somebody else');
H.set([row({Company:'A'})], {'d@s.com':{company:'B'}}, {ext:true});
ok(H.contactCompanyConflicts().length===0, 'nor is the flag raised in that preview');

// ── wiring ──
ok(/try\{ reconcileContactsWithAccounts\(\); \}catch\(e\)\{\}/.test(html),
   'it runs when the accounts arrive, which is the first moment the two can be compared');
ok((html.match(/RECONCILED_FOR=''/g)||[]).length>=3, 'and is reset with the project');
ok(/contactCompanyConflicts\(\)\.forEach/.test(html), 'the company disagreement reaches Needs Your Attention');
ok(/sec:'contacts'/.test(html), 'pointing at the directory');
ok(/signed up under/.test(html), 'and says what the person themselves put');
ok(/not a fact about the person, it is\s*\n\/\/ which contract they sit under/.test(html)
   || /which contract they sit under on this job/.test(html),
   'the reason company is excluded is written down, not just implied');

console.log((bad?'FAIL':'ok  '),' tools-test-reconcile.mjs —',n,'assertions');
process.exit(bad?1:0);
