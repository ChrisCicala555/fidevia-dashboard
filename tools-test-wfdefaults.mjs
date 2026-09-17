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
// Read through wfFromConfig now, which also cuts a pay app chain configured
// before pencil and final were separated into the two it is actually running.
ok(/wfFromConfig\(workflows\|\|\{\}, k\)/.test(ra), 'a saved workflow still wins over the default');
ok(/live\.length \? live :/.test(ra), 'and the template applies only where there is nothing at all');

// the templates themselves — the shape that was agreed
const tpl = html.split('const WF_TEMPLATES=')[1].split('// WF_DEFAULTS used to live here')[0];
for (const k of ['rfi:','sub:','payapp_pencil:','payapp_final:','co:']) ok(tpl.includes(k), 'template exists for '+k.replace(':',''));
// That decision was reversed. Pencil copies were left to the billing cycle on
// the grounds that the contractor uploads the finalised application; they are
// now a submission of their own, with a review chain that stops short of any
// signature.
ok(!/Pencil copies are handled by the billing cycle/.test(tpl),
   'the old note saying pencils are not a workflow is gone');
ok(/Nobody signs a pencil copy/.test(tpl),
   'and the reason the two chains are separate is recorded against them');
ok(/requireAll:true/.test(tpl), 'the all-must-sign steps survive');
ok(/parallel:true/.test(tpl), 'the parallel steps survive');
{
  const co = tpl.split('co:[')[1];
  ok(/Contractor Signature/.test(co) && /Fidevia Signature/.test(co)
     && /Architect Signature/.test(co) && /Owner Signature/.test(co),
     'the change order chain keeps all four signatures');
  // One chain became two. The pencil is worked through and the final is signed,
  // so 'Signed' as a single trailing step is gone: the signing is now named
  // steps on a chain of its own.
  const pen = tpl.split('payapp_pencil:[')[1].split(']')[0];
  const fin = tpl.split('payapp_final:[')[1].split(']')[0];
  ok(/Fidevia Records Amounts/.test(pen) && /Architect Review/.test(pen),
     'the pencil chain reads the amounts and takes them round the reviewers');
  ok(!/Signature|Signed/.test(pen), 'and asks nobody to sign a draft');
  ok(/Fidevia Signature/.test(fin) && /Architect Signature/.test(fin),
     'the final chain is the two signatures');
}

// round trip: what is drawn can be gathered back
ok(/wfStepRow\(prefix,key,s\.name,s\.person,s\.parallel,s\.requireAll,s\.company\)/.test(html),
   'parallel and all-must-sign are rendered, not dropped on the way in \u2014 and so is the firm the '
   +'step belongs to, with the person still passed so an older chain can name its firm from them');
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
