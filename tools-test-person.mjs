// The company-fit warning is the point of this feature: it should fire when
// nobody from the person's firm is on the project, and stay quiet otherwise.
function companyFit(personCompany, projectCompanies){
  const co=String(personCompany||'').trim();
  if(!co) return {warn:true, reason:'no-company'};
  const known=projectCompanies.some(x=>String(x).trim().toLowerCase()===co.toLowerCase());
  return known ? {warn:false} : {warn:true, reason:'company-absent'};
}
const lincoln=['Summit Builders','Comfort Systems','AH Plumbing','Voltage Electric','Draper & Associates','Lincoln School District','Fidevia'];

let pass=0,fail=0; const ck=(n,c,x='')=>{(c?pass++:fail++);console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:''));};

ck('a company already on the project is silent', companyFit('Summit Builders', lincoln).warn===false);
ck('case does not matter', companyFit('summit builders', lincoln).warn===false);
ck('trailing space does not matter', companyFit('Summit Builders  ', lincoln).warn===false);
ck('an absent company warns', companyFit('Big Bear Construction', lincoln).warn===true, '<-- the case that matters');
ck('and says why', companyFit('Big Bear Construction', lincoln).reason==='company-absent');
ck('no company recorded warns separately', companyFit('', lincoln).reason==='no-company');
ck('an empty project warns for anyone', companyFit('Summit Builders', []).warn===true, '(first company on a new job)');

// A contractor must carry a company; the other roles need not
const needsCompany = (role, co) => role==='contractor' && !String(co||'').trim();
ck('contractor without a company is blocked', needsCompany('contractor','')===true);
ck('contractor with a company is fine', needsCompany('contractor','Summit Builders')===false);
ck('an architect without a company is allowed', needsCompany('architect-engineer','')===false);
ck('an owner without a company is allowed', needsCompany('owner','')===false);

// Only offer projects they are not already on
const have=new Set(['1','3']);
const all=[{id:'1'},{id:'2'},{id:'3'},{id:'4'}];
ck('already-granted projects are not offered',
   all.filter(p=>!have.has(p.id)).map(p=>p.id).join()==='2,4');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
