export let currentProject={name:'Lincoln',folders:{},config:{}}, allData={co:[]};
export function setup(cfg,cos){ currentProject.config=cfg; allData.co=cos; }
const payNum=x=>parseFloat(String(x==null?'':x).replace(/[^0-9.\-]/g,''))||0;
const orgKeyOf=n=>String(n||'').trim().toLowerCase().replace(/[.,]/g,'').replace(/\s+/g,' ');
function rowCompany(r){
  if(!r) return '';
  const direct=String(r['Company']||r['Contractor']||'').trim();
  if(direct) return direct;
  const m=String(r['Submitted By']||r['Submitted By (Sub)']||'').match(/\(([^)]+)\)\s*$/);
  return m?m[1].trim():'';
}
function coApprovedAmount(r){
  const a=payNum(r&&r['Approved Amount']);
  return a || payNum(r&&r['Cost Impact']);
}
function coAllowanceDraw(r){
  // Never draw more than the change order is worth.
  return Math.min(payNum(r&&r['Applied to Allowance']), coApprovedAmount(r));
}
function coContractImpact(r){ return Math.max(0, coApprovedAmount(r)-coAllowanceDraw(r)); }
function coIsApproved(r){
  const st=String((r&&r['Status'])||'').toLowerCase();
  return st.indexOf('approv')>=0 || st.indexOf('execut')>=0;
}
function allowanceFor(name){
  return allowancesFor(name).reduce((s,a)=>s+a.amount,0);
}
function allowanceUsedById(name, id){
  const norm=String(name||'').trim().toLowerCase();
  const want=String(id||'').trim().toUpperCase();
  return (allData.co||[]).filter(r=>coIsApproved(r)
      && String(r['Company']||'').trim().toLowerCase()===norm
      && (coAllowanceId(r)===want || (!coAllowanceId(r) && want==='A')))
    .reduce((s,r)=>s+coAllowanceDraw(r),0);
}
function allowanceRemainingById(name, id){ 
  const a=allowancesFor(name).find(x=>x.id===String(id||'').trim().toUpperCase());
  return (a?a.amount:0)-allowanceUsedById(name,id);
}
function coContractMathFor(r){
  const co=rowCompany(r);
  const norm=x=>String(x||'').trim().toLowerCase();
  const cfg=(currentProject&&currentProject.config)||{};
  const rec=(cfg.contractors||[]).find(c=>norm(c.name)===norm(co));
  const original=payNum(rec&&rec.contract);
  const mine=(allData.co||[]).filter(x=>norm(rowCompany(x))===norm(co));
  const dateOf=x=>Date.parse(x['Date Approved']||x['Date Submitted']||'')||0;
  const thisDate=dateOf(r);
  const previous=mine.filter(x=>x!==r && coIsApproved(x) && dateOf(x)<=thisDate)
                     .reduce((sum,x)=>sum+coContractImpact(x),0);
  const thisImpact=coContractImpact(r);
  return { company:co, original, previous, prior:original+previous,
           approved:coApprovedAmount(r), allowance:coAllowanceDraw(r),
           thisImpact, after:original+previous+thisImpact,
           allowanceTotal:allowanceFor(co), allowanceLeft:allowanceRemaining(co) };
}
export { coContractMathFor, coIsApproved };