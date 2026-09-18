// "I didn't fully create the project for West Earl yet... do I need to start
// from scratch to incorporate everything we've worked on?"
//
// Almost none of it: the document folders and the email wording are Fidevia's
// and are read when they are used, not copied into a project. The review
// chains are the exception - a draft stores what was gathered, which is the
// whole point of a draft, so a setup paused before the defaults changed still
// carries the old ones. This is the way to take the new ones without starting
// the setup again.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage('index.html'); P.run(SEED);

console.log('What a draft freezes, and what it does not');
{
  const d=html.split('function wizCaptureState')[1].split('function wizRestoreState')[0];
  ['contacts','contractors','milestones','workflows','workflowsByCompany']
    .forEach(k=>ok(new RegExp(k+':').test(d), 'a draft keeps '+k));
  ok(!/docFolders|emails:/.test(d),
     'and keeps no document folders or email wording — those are Fidevia’s, read when used');
}
ok(/const tmpl = \(await getSettings\(\)\)\.docFolders;/.test(fs.readFileSync('netlify/functions/box-proxy.mjs','utf8')),
   'the folders a project gets are read at the moment they are created');

console.log('Taking the current defaults without starting again');
ok(/id="npwf-fidevia"/.test(html), 'there is a button for it on the workflow step');
ok(/Use Fidevia’s current defaults/.test(html), 'saying what it does');
{
  const f=html.split('async function wizWfUseFidevia')[1].split('function wizWfCapture')[0];
  ok(/await fidSettings\(\)/.test(f), 'it reads what Project Settings holds now');
  ok(/confirm\(/.test(f), 'and asks first, because it discards what is on screen');
  ok(/Every other step of this setup is untouched/.test(f),
     'saying plainly that only the chains change');
  ok(/if\(NPWF_SCOPE\) NPWF_BYCO\[NPWF_SCOPE\]=w\|\|null; else NPWF_DEFAULT=w;/.test(f),
     'and it replaces the chain being looked at, not always the default one');
}

console.log('It behaves');
P.run(`FID_SETTINGS={workflows:{sub:[{name:'Fidevia Standard Review',company:'Architect 2'}]}};
  NPWF_SCOPE=''; NPWF_BYCO={}; NPWF_DEFAULT={sub:[{name:'Old Saved Step',company:'Summit Builders'}]};
  window.confirm=function(){ return true; };
  wfRenderAll('npwf','np-workflows',NPWF_DEFAULT,[]); 1;`);
ok(/value="Old Saved Step"/.test(P.run("document.getElementById('np-workflows').innerHTML")),
   'the draft’s own chain is what a resumed setup shows');
await P.run("wizWfUseFidevia()");
{
  const h=P.run("document.getElementById('np-workflows').innerHTML");
  ok(/value="Fidevia Standard Review"/.test(h), 'pressing it brings in the current default');
  ok(!/value="Old Saved Step"/.test(h), 'and the old one is gone');
  ok(P.run("JSON.stringify(NPWF_DEFAULT.sub[0].name)")==='"Fidevia Standard Review"',
     'the wizard will now build with it');
}
P.run(`window.confirm=function(){ return false; };
  NPWF_DEFAULT={sub:[{name:'Old Saved Step',company:'Summit Builders'}]};
  wfRenderAll('npwf','np-workflows',NPWF_DEFAULT,[]); 1;`);
await P.run("wizWfUseFidevia()");
ok(/value="Old Saved Step"/.test(P.run("document.getElementById('np-workflows').innerHTML")),
   'saying no changes nothing');

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
