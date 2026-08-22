// Replays every path that previously desynced the controls from the variables.
function makeUI(){
  const ui={
    EXTERNAL:false, externalMode:false,
    roleSelect:{value:'contractor', display:'none'},
    coSelect:{value:'', display:'none'},
    VIEWER_ROLE:'', VIEWER_COMPANY:'',
    sync(){
      if(this.EXTERNAL) return;
      const ext=this.externalMode;
      this.roleSelect.display = ext?'inline-block':'none';
      if(!ext){ this.VIEWER_ROLE=''; this.VIEWER_COMPANY=''; this.coSelect.display='none'; this.coSelect.value=''; return; }
      this.VIEWER_ROLE = this.roleSelect.value || 'contractor';
      const scoped = this.VIEWER_ROLE==='contractor';
      this.coSelect.display = scoped?'inline-block':'none';
      if(scoped){ this.VIEWER_COMPANY = this.coSelect.value||''; }
      else { this.VIEWER_COMPANY=''; this.coSelect.value=''; }
    },
    setMode(m){ this.externalMode=(m==='external'); this.sync(); },
    setRole(v){ this.roleSelect.value=v; this.sync(); },
    setCompany(v){ this.coSelect.value=v; this.sync(); },
    role(){ return this.externalMode ? (this.VIEWER_ROLE||'contractor') : 'fidevia'; },
    // What the user sees vs what the filters use
    consistent(){
      if(!this.externalMode) return true;
      if(this.roleSelect.value!==this.VIEWER_ROLE) return false;
      if(this.VIEWER_ROLE==='contractor') return this.coSelect.value===this.VIEWER_COMPANY;
      return this.VIEWER_COMPANY==='' && this.coSelect.display==='none';
    }
  };
  return ui;
}
let pass=0,fail=0; const ck=(n,c,x='')=>{(c?pass++:fail++);console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:''));};

// The reported bug: pick A/E, then toggle Fidevia -> External
const ui=makeUI();
ui.setMode('external'); ui.setRole('architect-engineer');
ck('A/E selected', ui.role()==='architect-engineer' && ui.consistent());
ui.setMode('internal');
ui.setMode('external');
ck('after Fidevia round trip the role select still governs',
   ui.role()==='architect-engineer' && ui.consistent(),
   `select="${ui.roleSelect.value}" var="${ui.VIEWER_ROLE}"`);
ck('company dropdown stays hidden for A/E', ui.coSelect.display==='none');

// Contractor with a company, then A/E, then back
const u2=makeUI();
u2.setMode('external'); u2.setRole('contractor'); u2.setCompany('Summit Builders');
ck('contractor scoped', u2.VIEWER_COMPANY==='Summit Builders' && u2.consistent());
u2.setRole('architect-engineer');
ck('A/E clears company everywhere', u2.VIEWER_COMPANY==='' && u2.coSelect.value==='' && u2.consistent());
u2.setRole('contractor');
ck('back to contractor stays consistent', u2.consistent(), `select="${u2.coSelect.value}" var="${u2.VIEWER_COMPANY}"`);

// Owner never carries a company
const u3=makeUI(); u3.setMode('external'); u3.setRole('owner');
ck('owner has no company', u3.VIEWER_COMPANY==='' && u3.consistent());

// Exhaustive: no sequence of actions may desync
const actions=[u=>u.setMode('external'),u=>u.setMode('internal'),
  u=>u.setRole('contractor'),u=>u.setRole('architect-engineer'),u=>u.setRole('owner'),
  u=>u.setCompany('Summit Builders'),u=>u.setCompany('')];
let bad=0;
for(let t=0;t<3000;t++){
  const u=makeUI();
  for(let i=0;i<6;i++) actions[Math.floor(Math.random()*actions.length)](u);
  if(!u.consistent()) bad++;
}
ck('3000 random action sequences stay consistent', bad===0, bad?`${bad} desynced`:'');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
