// The generated change order is a document an owner signs, so the numbers on it
// have to be the numbers in the log, and it must refuse rather than print a
// blank where a party's address should be.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

fs.writeFileSync('.cg.tmp.mjs', [
  "export let currentProject={name:'Lincoln',folders:{},config:{}}, allData={co:[]};",
  "export function setup(cfg,cos){ currentProject.config=cfg; allData.co=cos; }",
  "const payNum=x=>parseFloat(String(x==null?'':x).replace(/[^0-9.\\-]/g,''))||0;",
  "const orgKeyOf=n=>String(n||'').trim().toLowerCase().replace(/[.,]/g,'').replace(/\\s+/g,' ');",
  grab('function rowCompany'), grab('function coApprovedAmount'), grab('function coAllowanceDraw'),
  grab('function coContractImpact('), grab('function coIsApproved'),
  grab('function allowanceFor'), grab('function allowanceUsedBy'), grab('function allowanceRemaining'),
  grab('function coContractMathFor'),
  "export { coContractMathFor, coIsApproved };"
].join('\n'));
const { coContractMathFor, setup } = await import('./.cg.tmp.mjs');

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

const CFG={contractors:[{name:'Summit Builders',contract:'20000000',allowance:'50000',active:true}]};
const co=(n,amt,allow,date,status)=>({'CO #':n,'Company':'Summit Builders','Approved Amount':String(amt),
  'Applied to Allowance':String(allow||0),'Status':status||'Approved','Date Approved':date});

console.log('The running contract maths');
const a=co('CO-001',100000,0,'2026-05-01'), b=co('CO-002',48200,20000,'2026-06-01'), c=co('CO-003',5000,0,'2026-07-01');
setup(CFG,[a,b,c]);
let m=coContractMathFor(b);
ok('original contract is the contractor’s',      m.original===20000000);
ok('previous counts only earlier change orders',   m.previous===100000);
ok('prior is original plus previous',              m.prior===20100000);
ok('the approved amount is stated in full',        m.approved===48200);
ok('the allowance draw is stated',                 m.allowance===20000);
// The whole point of the allowance: only the remainder raises the contract.
ok('only the remainder reaches the contract',      m.thisImpact===28200);
ok('the after figure adds only the remainder',     m.after===20128200);

console.log('Later change orders are not counted as previous');
ok('a later CO is excluded',  coContractMathFor(a).previous===0);
ok('and all earlier ones are included', coContractMathFor(c).previous===128200);

console.log('Unapproved change orders never count');
setup(CFG,[co('CO-001',100000,0,'2026-05-01','Pending Review'), b]);
ok('a pending CO is not previous', coContractMathFor(b).previous===0);

console.log('Allowance reporting');
setup(CFG,[b]);
m=coContractMathFor(b);
ok('the allowance total is shown',     m.allowanceTotal===50000);
ok('and what is left after the draw',  m.allowanceLeft===30000);

console.log('Odd data does not produce a nonsense document');
setup({contractors:[]},[b]);
ok('a contractor with no record gives zero, not NaN', coContractMathFor(b).original===0);
const noAmt=Object.assign({},b,{'Approved Amount':'','Cost Impact':'48200'});
setup(CFG,[noAmt]);
ok('a missing amount falls back to the cost impact', coContractMathFor(noAmt).approved===48200);

console.log('It refuses rather than printing a blank');
const gen=grab('function openCoGen');
ok('readiness is checked before the form', gen.indexOf('coDocumentReadiness') < gen.indexOf('cogen-summary'));
ok('the form is hidden when blocked',      /form\.style\.display='none'; go\.disabled=true;/.test(gen));
ok('it says which record to complete',     /Complete the organization records/.test(gen));

console.log('Signatories are chosen per document');
ok('four parties are offered', ['cg-sign-contractor','cg-sign-architect','cg-sign-cm','cg-sign-owner'].every(id=>html.includes('id="'+id+'"')));
ok('the architect firm follows the signatory', /Choosing the architect signatory also decides which firm/.test(html));
ok('the chosen firm is carried onto the document', /firm:a\.firm\|\|''/.test(src));
ok('likely signatories are offered first', /rank=c=>preferRole/.test(src));
ok('an empty firm falls back to everyone', /return \(mine\.length\?mine:all\);/.test(src));

console.log('Substantial completion');
ok('it defaults to the project date',   /d\.value=projectMilestone\('Substantial Completion'\)/.test(src));
ok('and is locked while unchanged',     /d\.disabled=same;/.test(src));
ok('the document says so explicitly',   /\\u2014 unchanged/.test(src));

console.log('The originating PCO');
ok('it is merged when it is a PDF',     /nm\.endsWith\('\.pdf'\) && window\.PDFLib/.test(src));
ok('pdf-lib is loaded',                 html.includes('pdf-lib'));
ok('a non-PDF is not silently dropped', /not a PDF, so it remains attached/.test(src));
ok('a failed merge is reported',        /could not be merged/.test(src));
ok('the checkbox disables with no attachment', /box\.checked=false; box\.disabled=true;/.test(src));

console.log('What happens to the result');
ok('it is filed in the change order’s own folder', /itemFolderId\('co'/.test(src));
ok('it is recorded as a version',       /Change order document generated\./.test(src));
ok('and on the row as the signed file', /r\['Signed File ID'\]=ent\.id/.test(src));
ok('the run is audited',                /auditLog\('Generated change order'/.test(src));

console.log('Who can generate, and when');
const btn=grab('function coGenBtn');
ok('admins only',                 /if\(!IS_ADMIN \|\| viewingAsExternal\(\)\) return '';/.test(btn));
ok('only once approved',          /if\(!coIsApproved\(r\)\) return '';/.test(btn));
ok('regenerating is offered after the first time', /done\?'Regenerate':'Generate CO'/.test(btn));


console.log('Text fits its column');
const build=grab('async function buildChangeOrderPDF');
ok('party columns wrap instead of overflowing', /doc\.splitTextToSize\(String\(ln\), tw\)/.test(build));
ok('columns have a gutter',                     /const GUT=14, cw=\(W-2\*M\)\/3, tw=cw-GUT;/.test(build));
ok('the block grows with the longest column',   /partyLines=Math\.max\(partyLines,line\)/.test(build));
ok('the description already wrapped',           /doc\.splitTextToSize\(String\(r\['Description'\]/.test(build));

console.log('Addresses read like an envelope');
ok('city, state and ZIP share a line',
   /\[\[o\.city,o\.state\]\.filter\(Boolean\)\.join\(', '\), o\.zip\]\.filter\(Boolean\)\.join\(' '\)/.test(src));
ok('the project address uses the stored parts', /const pa=\(currentProject\.config&&currentProject\.config\.address\)/.test(build));
ok('and falls back to the joined string',       /projLines\.length>1 \? projLines/.test(build));

console.log('The logo');
ok('it is embedded from the same file the emails use', /urlToDataURL\('\.\/fidevia-email-logo\.png'\)/.test(build));
ok('the wordmark remains a fallback',           /if\(!logoOK\)\{[\s\S]{0,200}doc\.text\('Fidevia'/.test(build));
ok('the header height follows which was used',  /y\+= logoOK \? 62 : 38;/.test(build));
ok('the builder is awaited',                    /await buildChangeOrderPDF\(r,\{/.test(src));

fs.rmSync('.cg.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
