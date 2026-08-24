// The Home KPI header must show a contractor their own contract, and must
// agree with the Financial Summary. Those two used different change order
// maths, which is how Home said $21.75M while the summary said $21.54M.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

const harness=`
let currentProject={config:{contractors:[
  {name:'Summit Builders', contract:'20000000', allowance:'500000', active:true},
  {name:'Comfort Systems', contract:'1750000',  allowance:'100000', active:true}
]}};
let allData={ pay_apps:[
  {Contractor:'Summit Builders', 'Contract Amount':'20000000','Approved Change Orders':'219500','Requested Amount':'2500000','Approved Amount':'2500000',Status:'Approved',Period:'2026-06-01'},
  {Contractor:'Comfort Systems', 'Contract Amount':'1750000', 'Approved Change Orders':'0','Requested Amount':'250000','Approved Amount':'250000',Status:'Approved',Period:'2026-06-01'}
], co:[
  // Approved CO worth 219,500 with 100,000 drawn from Summit's allowance:
  // only 119,500 should reach the contract.
  {Company:'Summit Builders', Status:'Approved','Approved Amount':'219500','Applied to Allowance':'100000'}
]};
let VIEWER_ROLE='', VIEWER_COMPANY='', EXTERNAL=false;
const payNum=x=>parseFloat(String(x==null?'':x).replace(/[^0-9.\\-]/g,''))||0;
const payApproved=r=>{const s=(r.Status||'').toLowerCase(); if(!(s.includes('approv')||s.includes('signed')))return 0; return payNum(r['Approved Amount'])||payNum(r['Requested Amount']);};
function viewingAsExternal(){ return EXTERNAL || VIEWER_ROLE!==''; }
function isContractorView(){ return viewingAsExternal() && VIEWER_ROLE==='contractor'; }
function companyScope(){ return isContractorView()?VIEWER_COMPANY:''; }
function allowanceFor(n){const c=currentProject.config.contractors.find(x=>x.name===n);return payNum(c&&c.allowance);}
`;

const code=[harness,
  grab('function coApprovedAmount'), grab('function coAllowanceDraw'),
  grab('function coContractImpact('), grab('function coIsApproved'),
  grab('function allowanceUsedBy'), grab('function coContractImpactFor'),
  grab('function financialTotals'),
].join('\n')+`
export { financialTotals };
export function setViewer(r,c){ VIEWER_ROLE=r; VIEWER_COMPANY=c; EXTERNAL=!!r; }
`;
fs.writeFileSync('.kpi.tmp.mjs',code);
const m=await import('./.kpi.tmp.mjs');

let pass=0,fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };
const money=v=>'$'+v.toLocaleString();

// Fidevia sees the whole project.
m.setViewer('','');
let f=m.financialTotals();
// 20,000,000 + 119,500 (CO less allowance draw) + 1,750,000 = 21,869,500
ok('internal sees the project total, allowance-aware: '+money(f.revised), f.revised===21869500);
ok('internal header is not labelled as personal', f.scoped===false);
ok('internal billed is both contractors', f.billed===2750000);

// A contractor sees only their own contract.
m.setViewer('contractor','Comfort Systems');
f=m.financialTotals();
ok('contractor sees only their contract: '+money(f.revised), f.revised===1750000);
ok('contractor header is labelled as personal', f.scoped===true);
ok('contractor billed is their own', f.billed===250000);
ok('contractor % billed is their own', Math.abs(f.pctBilled-250000/1750000)<1e-9);
ok('contractor never sees the project total', f.revised!==21869500);

// The allowance draw must not inflate the contract it came from.
m.setViewer('contractor','Summit Builders');
f=m.financialTotals();
ok('allowance-funded CO does not raise the contract twice: '+money(f.revised), f.revised===20119500);
ok('raw pay app figure (219,500) is not used', f.revised!==20219500);

// Architect/Engineer and Owner review the whole project.
for(const r of ['architect-engineer','owner']){
  m.setViewer(r,'');
  f=m.financialTotals();
  ok(r+' sees the project total', f.revised===21869500);
  ok(r+' header is not labelled as personal', f.scoped===false);
}

// A contractor whose company matches nothing must see zero, not everything.
m.setViewer('contractor','Unknown Co');
f=m.financialTotals();
ok('unmatched company sees nothing, not the total', f.revised===0);

fs.unlinkSync('.kpi.tmp.mjs');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
