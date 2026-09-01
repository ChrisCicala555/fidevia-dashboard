export let allData={};
export function seed(k,rows){ allData[k]=rows; }
function rowCompany(r){
  if(!r) return '';
  const direct=String(r['Company']||r['Contractor']||'').trim();
  if(direct) return direct;
  const m=String(r['Submitted By']||r['Submitted By (Sub)']||'').match(/\(([^)]+)\)\s*$/);
  return m?m[1].trim():'';
}
function nextItemNumber(key, comp){
  const label={rfi:'RFI',co:'CO',sub:'SUB',pay_apps:'PA'}[key];
  const idField={rfi:'RFI #',co:'CO #',sub:'Submittal #',pay_apps:'App #'}[key];
  if(!label || !idField) return '';
  // Pay applications stay per contractor: they are billing against one
  // contract, so a shared trade run would be wrong.
  if(key==='pay_apps') return nextItemNumberByCompany(label, idField, comp);
  const code=tradeCodeFor(comp);
  const rows=allData[key]||[]; let max=0;
  rows.forEach(r=>{
    const v=String(r[idField]||'');
    // The new form carries its own code. Anything numbered before this change
    // is matched by the company it belongs to, so an existing log continues
    // into the right run instead of restarting at 001.
    let m=v.match(/^[A-Za-z]+-([A-Z]{2,5})-(\d+)\s*$/);
    if(m){ if(m[1].toUpperCase()===code){ const n=parseInt(m[2],10); if(n>max) max=n; } return; }
    if(tradeCodeFor(rowCompany(r))!==code) return;
    let o=v.match(/-(\d+)_/) || v.match(/^\s*(?:no\.?\s*|#\s*)?(\d+)\s*$/i);
    if(o){ const n=parseInt(o[1],10); if(n>max) max=n; }
  });
  return label+'-'+code+'-'+String(max+1).padStart(3,'0');
}
export { nextItemNumber, rowCompany };