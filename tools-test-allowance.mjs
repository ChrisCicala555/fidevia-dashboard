// Allowance maths. A change order funded from the allowance must NOT inflate
// the contract — the allowance was already bought and sits inside it.
const payNum = v => parseFloat(String(v==null?'':v).replace(/[^0-9.\-]/g,''))||0;
const coApprovedAmount = r => payNum(r['Approved Amount']) || payNum(r['Cost Impact']);
const coAllowanceDraw  = r => Math.min(payNum(r['Applied to Allowance']), coApprovedAmount(r));
const coContractImpact = r => Math.max(0, coApprovedAmount(r) - coAllowanceDraw(r));
const coIsApproved = r => /approv|execut/i.test(String(r.Status||''));

const contractors=[{name:'Summit Builders', contract:12000000, allowance:10000}];
const cos=[
  {Company:'Summit Builders', Status:'Approved', 'Approved Amount':4000, 'Applied to Allowance':4000},  // fully from allowance
  {Company:'Summit Builders', Status:'Approved', 'Approved Amount':9000, 'Applied to Allowance':6000},  // partly
  {Company:'Summit Builders', Status:'Approved', 'Approved Amount':5000, 'Applied to Allowance':0},     // none
  {Company:'Summit Builders', Status:'Open',     'Approved Amount':7000, 'Applied to Allowance':7000},  // not approved
];
const used = cos.filter(coIsApproved).reduce((s,r)=>s+coAllowanceDraw(r),0);
const impact = cos.filter(coIsApproved).reduce((s,r)=>s+coContractImpact(r),0);

let pass=0,fail=0; const ck=(n,c,x='')=>{(c?pass++:fail++);console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:''));};

ck('allowance drawn = 10,000', used===10000, `got ${used}`);
ck('remaining allowance = 0', contractors[0].allowance-used===0);
ck('contract impact = 8,000', impact===8000, `got ${impact}  (3,000 + 5,000)`);
ck('a fully-covered CO adds nothing to contract', coContractImpact(cos[0])===0, '<-- the whole point');
ck('a partly-covered CO adds only the excess', coContractImpact(cos[1])===3000);
ck('an unapproved CO draws nothing', !coIsApproved(cos[3]));

const revised = contractors[0].contract + impact;
ck('revised contract = 12,008,000', revised===12008000, `got ${revised}`);
ck('naive maths would have overstated by 10,000',
   (contractors[0].contract + cos.filter(coIsApproved).reduce((s,r)=>s+coApprovedAmount(r),0)) - revised === 10000,
   '<-- what the dashboard did before');

// Guardrails
ck('draw cannot exceed the CO value',
   coAllowanceDraw({'Approved Amount':1000,'Applied to Allowance':5000})===1000);
ck('contract impact never negative',
   coContractImpact({'Approved Amount':1000,'Applied to Allowance':5000})===0);
ck('falls back to Cost Impact before approval',
   coApprovedAmount({'Cost Impact':2500})===2500);
ck('over-drawn allowance shows negative remaining, not hidden',
   10000 - [{Company:'x',Status:'Approved','Approved Amount':15000,'Applied to Allowance':15000}]
     .reduce((s,r)=>s+coAllowanceDraw(r),0) === -5000, '(so it is visible, not silently clamped)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
