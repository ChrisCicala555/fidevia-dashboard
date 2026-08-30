// One set of workflow defaults, drawn and saved.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(!/^const WF_DEFAULTS=/m.test(html), 'the older stub set is gone');
ok(/WF_DEFAULTS used to live here/.test(html), 'and why it went is recorded');
ok(!/WF_DEFAULTS\[k\]/.test(html), 'nothing still reads it');

const ra = html.split('function wfRenderAll')[1].split('function wfGather')[0];
ok(/WF_TEMPLATES\[k\]/.test(ra), 'the wizard draws the agreed defaults');
ok(/Object\.assign\(\{\},x\)/.test(ra), 'steps are copied, so editing one project cannot alter the template');
ok(/\(workflows&&workflows\[k\]\)/.test(ra), 'a saved workflow still wins over the default');

// the templates themselves — the shape that was agreed
const tpl = html.split('const WF_TEMPLATES=')[1].split('// WF_DEFAULTS used to live here')[0];
for (const k of ['rfi:','sub:','payapp:','co:']) ok(tpl.includes(k), 'template exists for '+k.replace(':',''));
ok(/Pencil copies are handled by the billing cycle/.test(tpl),
   'the pencil-copy decision is still recorded against the payapp template');
ok(/requireAll:true/.test(tpl), 'the all-must-sign steps survive');
ok(/parallel:true/.test(tpl), 'the parallel steps survive');
{
  const co = tpl.split('co:[')[1];
  ok(/Contractor Signature/.test(co) && /Fidevia Signature/.test(co)
     && /Architect Signature/.test(co) && /Owner Signature/.test(co),
     'the change order chain keeps all four signatures');
  const pa = tpl.split('payapp:[')[1].split('co:[')[0];
  ok(/Fidevia Records Amounts/.test(pa) && /Architect Review/.test(pa) && /Signed/.test(pa),
     'the payment application chain is intact');
}

// round trip: what is drawn can be gathered back
ok(/wfStepRow\(prefix,key,s\.name,s\.person,s\.parallel,s\.requireAll\)/.test(html),
   'parallel and all-must-sign are rendered, not dropped on the way in');
{
  const g = html.split('function wfGather')[1].split("let WF_SCOPE")[0];
  ok(/parallel:r\.querySelector\('\.wf-par'\)\.checked/.test(g), 'and read back out');
  ok(/requireAll:!!\(r\.querySelector\('\.wf-all'\)/.test(g), 'both of them');
}

// the creation fallback stays as a safety net but is no longer load-bearing
ok(/Object\.keys\(WF_TEMPLATES\)\.forEach\(k=>\{ if\(!\(g\[k\]&&g\[k\]\.length\)\)/.test(html),
   'creation still fills an empty group from the template');

console.log((bad?'FAIL ':'ok   ')+'tools-test-wfdefaults.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
