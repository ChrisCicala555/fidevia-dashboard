// Staged editing: changes accumulate until Save, and typing a value back to
// its original must not count as a change.
let CONTACT_DIR=[
  {sub:'a', name:'Aisha Rahman', company:'Keystone Engineering', role:'MEP Engineer', phone:'(717) 555-0165'},
  {sub:'b', name:'Andre Martin', company:'Fidevia', role:'Onsite Construction Manager', phone:'(717) 555-0101'},
];
let CD_DIRTY={};
function cdEdit(idx, field, val){
  const c=CONTACT_DIR[idx]; if(!c) return;
  const original=(c._orig&&c._orig[field]!==undefined)?c._orig[field]:c[field];
  c._orig=c._orig||{}; if(c._orig[field]===undefined) c._orig[field]=original;
  c[field]=val;
  const changed=String(val||'')!==String(c._orig[field]||'');
  CD_DIRTY[c.sub]=CD_DIRTY[c.sub]||{};
  if(changed) CD_DIRTY[c.sub][field]=val; else delete CD_DIRTY[c.sub][field];
  if(!Object.keys(CD_DIRTY[c.sub]).length) delete CD_DIRTY[c.sub];
}
const count=()=>Object.values(CD_DIRTY).reduce((n,o)=>n+Object.keys(o).length,0);
function discard(){
  CONTACT_DIR.forEach(c=>{ if(c._orig){ Object.keys(c._orig).forEach(f=>{ c[f]=c._orig[f]; }); delete c._orig; } });
  CD_DIRTY={};
}

let pass=0,fail=0; const ck=(n,c,x='')=>{(c?pass++:fail++);console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:''));};

ck('starts clean', count()===0);
cdEdit(0,'company','Keystone Engineering Inc');
ck('one edit registers', count()===1);
cdEdit(0,'role','Senior MEP Engineer');
ck('two fields, same person', count()===2 && Object.keys(CD_DIRTY).length===1, '<-- one request, not two');
cdEdit(1,'company','Fidevia LLC');
ck('a second person is separate', Object.keys(CD_DIRTY).length===2);

cdEdit(0,'company','Keystone Engineering');
ck('typing the original value back clears that change', count()===2,
   '(role + person B remain)');

const payload=Object.entries(CD_DIRTY).map(([sub,f])=>({sub, ...f}));
ck('payload batches fields per person',
   payload.find(p=>p.sub==='a').role==='Senior MEP Engineer' && !('company' in payload.find(p=>p.sub==='a')));

discard();
ck('discard restores every original',
   CONTACT_DIR[0].company==='Keystone Engineering' && CONTACT_DIR[0].role==='MEP Engineer'
   && CONTACT_DIR[1].company==='Fidevia' && count()===0);

// Editing, discarding, then editing again must not resurrect stale originals
cdEdit(0,'company','X'); discard(); cdEdit(0,'company','Y');
ck('a fresh edit after discard tracks correctly', count()===1 && CD_DIRTY['a'].company==='Y');
discard();
ck('and discards back to the true original', CONTACT_DIR[0].company==='Keystone Engineering');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
