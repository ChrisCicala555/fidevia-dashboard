// The dangerous part of archiving is index drift: filter the list and every
// row-index button starts pointing at the wrong record.
const isArchived = r => String(r.Archived||'').trim().toLowerCase()==='yes';
function splitByArchived(all, df){
  const paired=all.map((r,idx)=>({r,idx}));
  const bydate=(a,b)=>(Date.parse(b.r[df]||'')||0)-(Date.parse(a.r[df]||'')||0);
  return { live: paired.filter(p=>!isArchived(p.r)).sort(bydate),
           past: paired.filter(p=>isArchived(p.r)).sort(bydate) };
}
// The old approach, for contrast
const oldWay = rows => rows.filter(r=>!isArchived(r)).map((r,idx)=>({r,idx}));

const all=[
  {'RFI #':'RFI-001','Date Submitted':'2026-06-01', Archived:'Yes'},
  {'RFI #':'RFI-002','Date Submitted':'2026-07-01', Archived:''},
  {'RFI #':'RFI-003','Date Submitted':'2026-08-01', Archived:'Yes'},
  {'RFI #':'RFI-004','Date Submitted':'2026-08-10', Archived:''},
];

let pass=0,fail=0; const ck=(n,c,x='')=>{(c?pass++:fail++);console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:''));};

const {live,past}=splitByArchived(all,'Date Submitted');
ck('two live, two archived', live.length===2 && past.length===2);
ck('live indices point at the real rows',
   live.every(p=>all[p.idx]['RFI #']===p.r['RFI #']),
   live.map(p=>`${p.r['RFI #']}@${p.idx}`).join(' '));
ck('archived indices point at the real rows',
   past.every(p=>all[p.idx]['RFI #']===p.r['RFI #']),
   past.map(p=>`${p.r['RFI #']}@${p.idx}`).join(' '));

// Prove the old approach was wrong
const bad=oldWay(all);
const badTarget=all[bad[0].idx]['RFI #'];
ck('old approach targeted the WRONG row', badTarget!==bad[0].r['RFI #'],
   `would have hit ${badTarget} instead of ${bad[0].r['RFI #']}`);

// Newest first
ck('live sorted newest first', live[0].r['RFI #']==='RFI-004');
ck('past sorted newest first', past[0].r['RFI #']==='RFI-003');

// Archiving then restoring returns the row untouched
const row={...all[1]};
row.Archived='Yes'; row['Archived By']='Chris Cicala'; row['Archived Date']='2026-08-21';
ck('archive marks the row', isArchived(row));
row.Archived=''; row['Archived By']=''; row['Archived Date']='';
ck('restore clears it', !isArchived(row) && row['RFI #']==='RFI-002');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
