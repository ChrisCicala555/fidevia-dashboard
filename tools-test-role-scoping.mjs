// Mirrors companyScope() / the filter guards, to check each role gets the right rows.
const mk = (role, company, external=true) => ({
  role, company, external,
  isContractorView(){ return this.role==='contractor'; },
  viewingAsExternal(){ return this.external; },
  companyScope(){ return this.isContractorView() ? this.company : ''; },
});
const contractors=[{name:'Summit Builders'},{name:'Comfort Systems'},{name:'AH Plumbing'},{name:'Voltage Electric'}];
const pays=[{Contractor:'Summit Builders'},{Contractor:'Summit Builders'},{Contractor:'Comfort Systems'},{Contractor:'AH Plumbing'},{Contractor:'Voltage Electric'}];

function scope(v){
  let cs=contractors, ps=pays;
  if(v.viewingAsExternal() && v.isContractorView()){
    const mine=v.companyScope().toLowerCase();
    cs = cs.filter(c=>mine && c.name.toLowerCase()===mine);
    ps = mine ? ps.filter(p=>p.Contractor.toLowerCase()===mine) : [];
  }
  return {contractors:cs.length, pays:ps.length};
}

let pass=0,fail=0; const ck=(n,c,x='')=>{(c?pass++:fail++);console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:''));};

let r = scope(mk('contractor','Summit Builders'));
ck('contractor sees only itself', r.contractors===1 && r.pays===2, JSON.stringify(r));

r = scope(mk('architect-engineer',''));
ck('A/E sees all contractors', r.contractors===4 && r.pays===5, JSON.stringify(r)+'  <-- was $0');

r = scope(mk('owner',''));
ck('owner sees all contractors', r.contractors===4 && r.pays===5, JSON.stringify(r));

r = scope(mk('fidevia','',false));
ck('Fidevia internal sees all', r.contractors===4 && r.pays===5, JSON.stringify(r));

r = scope(mk('contractor',''));
ck('contractor preview with no company shows nothing', r.contractors===0 && r.pays===0, '(cannot simulate a company that is not chosen)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
