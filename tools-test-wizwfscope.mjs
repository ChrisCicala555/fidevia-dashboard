// Per-contractor workflow chains, set during project creation.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/id="npwf-scope" onchange="wizWfScopeChange\(\)"/.test(html), 'step 5 has a scope selector');
ok(/id="npwf-revert"/.test(html), 'and a way back to the default');
ok(/let NPWF_SCOPE=''/.test(html) && /let NPWF_BYCO=\{\}/.test(html) && /let NPWF_DEFAULT=null/.test(html),
   'the three pieces of state exist');

// the id the capture guard relies on must actually be produced
ok(/\['co','Change Orders'\]/.test(html), "the change order key is 'co'");
ok(/'<div id="'\+prefix\+'-'\+key\+'-rows">'/.test(html),
   "so wfBlock renders npwf-co-rows, which the capture guard looks for");

const so = html.split('function wizWfScopeOptions')[1].split('function wizWfCapture')[0];
ok(/wizGatherContractors\(\)\.map\(c=>c\.name\)/.test(so), 'the list comes from the contractors step');
ok(/Every company \(default\)/.test(so), 'the default is the first option');
ok(/NPWF_BYCO\[n\]\?' \\u2014 custom'/.test(so), 'a contractor with their own chain is marked');
ok(/Add contractors on the previous step/.test(so), 'with no contractors it says where they come from');
ok(/Only items raised by/.test(so), 'a chosen scope explains what it affects');

const sc = html.split('function wizWfScopeChange')[1].split('function wizWfRevert')[0];
ok(/wizWfCapture\(\)/.test(sc), 'switching scope keeps what was on screen');
ok(sc.indexOf('wizWfCapture()') < sc.indexOf('NPWF_SCOPE=sel.value'),
   'and does so before the scope changes');
ok(/NPWF_BYCO\[NPWF_SCOPE\] \|\| NPWF_DEFAULT/.test(sc),
   'a contractor with no chain starts from the default rather than from nothing');

const cap = html.split('function wizWfCapture')[1].split('let NPWF_DEFAULT')[0];
ok(/if\(NPWF_SCOPE\) NPWF_BYCO\[NPWF_SCOPE\]=g; else NPWF_DEFAULT=g;/.test(cap),
   'capture writes to whichever scope is open');

ok(/if\(WIZ_STEP!==5 && dir!==0\)/.test(html), 'leaving step 5 captures first');

// creation
{
  const cp = html.split('async function createProject')[1];
  ok(/workflowsByCompany: \(\(\)=>\{/.test(cp), 'overrides are saved');
  ok(/if\(NPWF_SCOPE\) NPWF_BYCO\[NPWF_SCOPE\]=wfGather\('npwf'\)/.test(cp),
     'the scope still on screen at creation is captured');
  ok(/Object\.keys\(g\)\.some\(k=>\(g\[k\]\|\|\[\]\)\.length\)/.test(cp),
     'an entirely empty chain is not saved as an override');
  ok(/\(WIZ_STEP===5 && !NPWF_SCOPE\) \? wfGather\('npwf'\) : \(NPWF_DEFAULT\|\|wfGather\('npwf'\)\)/.test(cp),
     'the default is taken from the right place whichever scope is open');
  ok(/same shape the dashboard reads and writes/.test(cp), 'the shared shape is called out');
}
// the dashboard's own reader, unchanged, must understand it
ok(/function wfOverrides\(\)\{ return \(currentProject&&currentProject\.config&&currentProject\.config\.workflowsByCompany\)\|\|\{\}; \}/.test(html),
   'the dashboard reads workflowsByCompany — the same key the wizard now writes');

// drafts
ok(/NPWF_SCOPE=''; NPWF_BYCO=\{\}; NPWF_DEFAULT=null;/.test(html), 'a fresh wizard starts clean');
{
  const cs = html.split('function wizCaptureState')[1].split('function wizRestoreState')[0];
  ok(/workflowsByCompany:/.test(cs), 'a draft carries the overrides');
  ok(/NPWF_SCOPE \? \(NPWF_DEFAULT\|\|\{\}\) : wfGather\('npwf'\)/.test(cs),
     'and the default, even when a contractor scope is open at the time');
  const rs = html.split('function wizRestoreState')[1].split('async function wizSaveDraft')[0];
  ok(/NPWF_BYCO=st\.workflowsByCompany\|\|\{\}/.test(rs), 'restoring brings them back');
  ok(/NPWF_SCOPE=''/.test(rs), 'and reopens on the default');
}

// behaviour
{
  let SCOPE='', BYCO={}, DEF=null;
  const gather=v=>({co:[{name:v}]});
  const capture=g=>{ if(SCOPE) BYCO[SCOPE]=g; else DEF=g; };
  capture(gather('default chain'));
  SCOPE='Summit Builders'; capture(gather('summit chain'));
  SCOPE='';
  ok(DEF.co[0].name==='default chain', 'the default survives editing a contractor');
  ok(BYCO['Summit Builders'].co[0].name==='summit chain', 'the override is held separately');
  ok(Object.keys(BYCO).length===1, 'only the edited contractor gets an override');
  const keep=Object.keys(BYCO).filter(co=>Object.keys(BYCO[co]).some(k=>(BYCO[co][k]||[]).length));
  ok(keep.length===1, 'a non-empty override is kept');
  BYCO['Empty Co']={co:[],rfi:[]};
  const keep2=Object.keys(BYCO).filter(co=>Object.keys(BYCO[co]).some(k=>(BYCO[co][k]||[]).length));
  ok(!keep2.includes('Empty Co'), 'an empty one is dropped rather than giving that firm no chain at all');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-wizwfscope.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
