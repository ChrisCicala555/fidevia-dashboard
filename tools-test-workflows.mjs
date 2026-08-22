// Per-contractor overrides must fall back cleanly, and client and server must
// resolve the SAME chain — otherwise an external user advances down a different
// route than the dashboard displays.
const WF_KEYMAP={rfi:'rfi',co:'co',sub:'sub',pay_apps:'payapp'};

const cfg={
  workflows:{ rfi:[{name:'Fidevia CM Review',person:'Andre Martin'},{name:'Architect Response',person:'Laura Simmons'}],
              sub:[{name:'Fidevia CM Review',person:'Andre Martin'}] },
  workflowsByCompany:{
    'Summit Builders':{ rfi:[{name:'Summit PM',person:'Brian Kessler'},{name:'Fidevia CM Review',person:'Andre Martin'},{name:'Architect Response',person:'Laura Simmons'}] },
    'Comfort Systems':{ sub:[] }   // present but empty: must NOT count as an override
  }
};

// client
function wfSteps(key){ return (cfg.workflows||{})[WF_KEYMAP[key]||key]||[]; }
function wfCompanyKey(c){ const t=String(c||'').trim().toLowerCase(); if(!t) return '';
  return Object.keys(cfg.workflowsByCompany||{}).find(k=>k.trim().toLowerCase()===t)||''; }
function wfStepsFor(key,company){ const ck=wfCompanyKey(company);
  if(ck){ const a=(cfg.workflowsByCompany[ck]||{})[WF_KEYMAP[key]||key]; if(Array.isArray(a)&&a.length) return a; }
  return wfSteps(key); }
function rowCompany(r){ if(!r) return '';
  const d=String(r['Company']||r['Contractor']||'').trim(); if(d) return d;
  const m=String(r['Submitted By']||r['Submitted By (Sub)']||'').match(/\(([^)]+)\)\s*$/); return m?m[1].trim():''; }

// server (independent implementation, as written in box-proxy)
function serverSteps(wfKey,company){
  const t=String(company||'').trim().toLowerCase();
  if(t){ const byCo=cfg.workflowsByCompany||{};
    const ck=Object.keys(byCo).find(k=>k.trim().toLowerCase()===t);
    if(ck){ const a=(byCo[ck]||{})[wfKey]; if(Array.isArray(a)&&a.length) return a; } }
  return ((cfg.workflows||{})[wfKey])||[];
}

let pass=0,fail=0; const ck=(n,c,x='')=>{(c?pass++:fail++);console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:''));};

ck('Summit RFI uses its override', wfStepsFor('rfi','Summit Builders')[0].name==='Summit PM');
ck('override is 3 steps', wfStepsFor('rfi','Summit Builders').length===3);
ck('AH Plumbing falls back to default', wfStepsFor('rfi','AH Plumbing')[0].name==='Fidevia CM Review');
ck('Summit SUBMITTAL falls back (override is RFI only)', wfStepsFor('sub','Summit Builders').length===1);
ck('empty override array does NOT count', wfStepsFor('sub','Comfort Systems')[0].name==='Fidevia CM Review',
   '<-- otherwise a cleared chain would strand items');
ck('no company falls back', wfStepsFor('rfi','').length===2);
ck('company match is case-insensitive', wfStepsFor('rfi','summit builders').length===3);

// Company inference from the row
ck('reads Company field', rowCompany({Company:'Summit Builders'})==='Summit Builders');
ck('reads Contractor field', rowCompany({Contractor:'Voltage Electric'})==='Voltage Electric');
ck('parses "Name (Company)"', rowCompany({'Submitted By':'Brian Kessler (Summit Builders)'})==='Summit Builders');
ck('unknown row yields default chain', wfStepsFor('rfi',rowCompany({}))[0].name==='Fidevia CM Review');

// Client and server must agree on every case
const cases=[['rfi','Summit Builders'],['rfi','AH Plumbing'],['sub','Summit Builders'],
             ['sub','Comfort Systems'],['rfi',''],['co','Summit Builders'],['rfi','SUMMIT BUILDERS']];
const same=cases.every(([k,c])=>JSON.stringify(wfStepsFor(k,c))===JSON.stringify(serverSteps(WF_KEYMAP[k]||k,c)));
ck('client and server resolve identically', same, '<-- external users advance server-side');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
