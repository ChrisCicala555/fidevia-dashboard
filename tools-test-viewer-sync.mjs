// Reproduces the drift: the company <select> and VIEWER_COMPANY must never disagree.
function makeUI(){
  return {
    VIEWER_ROLE:'contractor', VIEWER_COMPANY:'', select:{value:'', display:''},
    setRole(v){
      this.VIEWER_ROLE=v||'contractor';
      const scoped=(this.VIEWER_ROLE==='contractor');
      this.select.display = scoped?'inline-block':'none';
      if(scoped){ this.VIEWER_COMPANY = this.select.value||''; }
      else { this.VIEWER_COMPANY=''; this.select.value=''; }
    },
    setCompany(v){ this.select.value=v; this.VIEWER_COMPANY=v||''; },
    scope(){ return this.VIEWER_ROLE==='contractor' ? this.VIEWER_COMPANY : ''; },
    agrees(){ return this.VIEWER_ROLE!=='contractor' || this.select.value===this.VIEWER_COMPANY; },
  };
}
let pass=0,fail=0; const ck=(n,c,x='')=>{(c?pass++:fail++);console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:''));};

// The exact sequence from the bug report
const ui=makeUI();
ui.setRole('contractor'); ui.setCompany('Summit Builders');
ck('contractor with company scopes correctly', ui.scope()==='Summit Builders');
ui.setRole('architect-engineer');
ck('A/E clears the company', ui.scope()==='' && ui.VIEWER_COMPANY==='');
ck('A/E also clears the dropdown', ui.select.value==='', '(so it cannot show a stale name)');
ui.setRole('contractor');
ck('back to contractor: select and variable agree', ui.agrees(), `select="${ui.select.value}" var="${ui.VIEWER_COMPANY}"`);

// And the case that actually broke: dropdown kept a value the variable had lost
const bad=makeUI();
bad.setCompany('Summit Builders');
bad.VIEWER_COMPANY='';          // simulate the old clear-without-resync
bad.setRole('contractor');
ck('stale dropdown value is re-adopted', bad.scope()==='Summit Builders', '<-- was empty, giving $0');

// Round trip through Fidevia view
const rt=makeUI();
rt.setRole('contractor'); rt.setCompany('Comfort Systems');
rt.VIEWER_ROLE=''; rt.VIEWER_COMPANY=''; rt.select.value='';   // back to Fidevia
rt.setRole('contractor');
ck('Fidevia round trip leaves no stale company', rt.agrees() && rt.scope()==='');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
