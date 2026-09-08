export let currentProject={config:{}}, allData={contacts:[]}, PROJECT_ROLES={};
export function setup(cfg,contacts,roles){ currentProject.config=cfg||{}; allData.contacts=contacts||[]; PROJECT_ROLES=roles||{}; }
const RESPONSE_DEFAULT={gc:7, architect:7, engineer:10, submittal:14};

function responseDays(){
  const r=(currentProject&&currentProject.config&&currentProject.config.response)||{};
  const n=(v,d)=>{ const x=parseInt(v,10); return (x>=0&&x<=365)?x:d; };
  return { gc:n(r.gc,RESPONSE_DEFAULT.gc), architect:n(r.architect,RESPONSE_DEFAULT.architect),
           engineer:n(r.engineer,RESPONSE_DEFAULT.engineer), submittal:n(r.submittal,RESPONSE_DEFAULT.submittal) };
}
function disciplineOf(personName){
  const nm=String(personName||'').trim(); if(!nm) return '';
  const c=(allData.contacts||[]).find(x=>String(x['Name']||'').trim().toLowerCase()===nm.toLowerCase());
  const em=c ? String(c['Email']||'').trim().toLowerCase() : '';
  const granted=em ? (PROJECT_ROLES[em]||'') : '';
  if(granted==='engineer') return 'engineer';
  if(granted==='architect'||granted==='architect-engineer') return 'architect';
  if(granted==='contractor') return 'gc';
  // No grant: read the role written on the contact.
  const t=String((c&&c['Role'])||'').toLowerCase();
  if(/engineer/.test(t)) return 'engineer';
  if(/architect/.test(t)) return 'architect';
  if(t) return 'gc';
  return '';
}
export let WF_CHAIN=[]; export function setChain(c){ WF_CHAIN=c||[]; }
function wfStepsFor(){ return WF_CHAIN; }
function rfiDueDaysFromWorkflow(){ return rfiDueFromWorkflow().days; }
function rfiDueDays(personName){
  const d=responseDays();
  const disc=disciplineOf(personName);
  return disc ? d[disc] : rfiDueDaysFromWorkflow();
}
function parseLocalDate(v){
  if(v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const m=String(v||'').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return new Date(+m[1], +m[2]-1, +m[3]);
  const d=new Date(v);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(isoOrDate, days){
  const base = parseLocalDate(isoOrDate);
  if(!base) return null;
  base.setDate(base.getDate()+(parseInt(days,10)||0));
  return base;
}
function isoDay(d){ return d ? d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') : ''; }
const OPEN_STATES=/open|pending|under review|revise/i;
function offContractDays(r){
  const set=parseLocalDate(r&&r['Due Date']), owed=parseLocalDate(r&&r['Contract Due']);
  if(!set||!owed) return 0;
  return Math.round((set-owed)/86400000);
}
const esc=x=>String(x==null?'':x); const fmtDMY=x=>String(x||'');
function offContractFlag(r){
  const d=offContractDays(r);
  if(!d) return '';
  const shorter=d<0, n=Math.abs(d);
  return '<span class="off-contract'+(shorter?' short':'')+'" title="The contract allows until '
    +esc(fmtDMY(r['Contract Due']))+'. This was set '+n+' day'+(n===1?'':'s')+(shorter?' earlier':' later')+'.">'
    +(shorter?'\u2212':'+')+n+'d</span>';
}
function isOverdue(r){
  if(!OPEN_STATES.test(String(r['Status']||''))) return false;
  const d=parseLocalDate(r['Due Date']); if(!d) return false;
  const today=new Date(); today.setHours(0,0,0,0);
  return d<today;
}
export { responseDays, disciplineOf, rfiDueDays, parseLocalDate, addDays, isoDay, isOverdue, offContractDays, offContractFlag };