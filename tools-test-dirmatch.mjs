// Mismatch detection between a project contact and the global directory.
// False positives are worse than misses here — a flag on every row is noise.
const normCmp   = v => String(v==null?'':v).replace(/\s+/g,' ').trim().toLowerCase();
const normPhone = v => String(v==null?'':v).replace(/[^0-9]/g,'');
const DIR_COMPARE=[['Company','company'],['Name','name'],['Phone','phone']];

function dirMismatches(r, profiles){
  const em=String(r['Email']||'').trim().toLowerCase();
  const prof=em?profiles[em]:null;
  if(!prof) return [];
  const out=[];
  DIR_COMPARE.forEach(([field,key])=>{
    const mine=r[field], theirs=prof[key];
    if(!String(theirs||'').trim()) return;
    if(!String(mine||'').trim()) return;
    const same = field==='Phone' ? normPhone(mine)===normPhone(theirs) : normCmp(mine)===normCmp(theirs);
    if(!same) out.push({field, theirs:String(theirs)});
  });
  return out;
}

const profiles={
  'dchen@example.com':{name:'David Chen', company:'Summit Builders', phone:'(503) 555-0143', title:'Project Manager'},
  'sdraper@example.com':{name:'Sarah Draper', company:'Draper & Associates', phone:'5035550118', title:'Architect'},
};
const f = (r) => dirMismatches(r, profiles).map(m=>m.field);

let pass=0,fail=0; const ck=(n,c,x='')=>{(c?pass++:fail++);console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:''));};

ck('identical rows raise nothing',
   f({Email:'dchen@example.com',Name:'David Chen',Company:'Summit Builders',Phone:'(503) 555-0143'}).length===0);

ck('a genuine company difference is flagged',
   f({Email:'dchen@example.com',Name:'David Chen',Company:'Sumit Builders',Phone:'(503) 555-0143'}).join()==='Company',
   '(typo caught)');

ck('phone formatting alone is NOT a mismatch',
   f({Email:'sdraper@example.com',Name:'Sarah Draper',Company:'Draper & Associates',Phone:'(503) 555-0118'}).length===0,
   '<-- same digits, different punctuation');

ck('whitespace and case alone are NOT a mismatch',
   f({Email:'dchen@example.com',Name:'david  chen',Company:'summit builders ',Phone:'5035550143'}).length===0);

ck('a blank project value is not a conflict',
   f({Email:'dchen@example.com',Name:'David Chen',Company:'',Phone:''}).length===0,
   '(missing is not disagreeing)');

ck('a blank directory value is not a conflict',
   dirMismatches({Email:'x@y.com',Company:'Anything'}, {'x@y.com':{name:'',company:'',phone:''}}).length===0);

ck('someone with no account is never flagged',
   f({Email:'nobody@example.com',Name:'Nobody',Company:'Whoever'}).length===0,
   '<-- most project contacts have no account');

ck('multiple fields can differ at once',
   f({Email:'dchen@example.com',Name:'Dave Chen',Company:'Sumit',Phone:'5035559999'}).length===3);

ck('role is deliberately never compared',
   !DIR_COMPARE.some(([f])=>f==='Role'), '(same person, different role per job)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
