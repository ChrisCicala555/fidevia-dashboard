// "Also also yes please add the workflows to the project settings tab."
//
// The review chains a new project starts with, set once for Fidevia rather
// than rebuilt in the wizard every time. Each project can still be changed
// afterwards, and a contractor can still be given their own chain - this is
// only the starting point.
import fs from 'fs';
import { execSync } from 'child_process';
execSync('node tools-extract-filters.mjs', { cwd: process.cwd() });
const WF = await import('./.filters.tmp.mjs');
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const srv=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const P=bootPage('index.html'); P.run(SEED);

console.log('The page has somewhere to set them');
ok(/id="ps-workflows"/.test(html), 'a panel on Project Settings');
ok(/Default Review Workflows/.test(html), 'named for what it is');
ok(/wfRenderAll\('pswf','ps-workflows'/.test(html), 'drawn by the editor the wizard already uses');
ok(/workflows:wfGather\('pswf'\)/.test(html), 'and read by the same reader, so the two cannot drift');
ok(/can still\s+be changed afterwards/.test(html), 'and it says a project can still be changed after');

console.log('A new project starts from them');
ok(/let FID_SETTINGS=null;/.test(html), 'the defaults are fetched');
ok(/if\(FID_SETTINGS\) return FID_SETTINGS;/.test(html), 'once, then kept');
ok(/if\(NPWF_DEFAULT \|\| NPWF_SCOPE\) return;/.test(html),
   'and never overwrite a chain already edited in the wizard');
ok(/catch\(e\)\{ FID_SETTINGS=\{\}; \}/.test(html),
   'settings that cannot be reached do not block making a project');

console.log('What the server will store');
ok(WF.WF_KEYS.join()==='rfi,co,sub,payapp_pencil,payapp_final',
   'every chain the dashboard runs, and only those');
{
  const c=WF.cleanWorkflows({sub:[{name:'Architect Review',company:'Architect 2',parallel:true,requireAll:true}]});
  ok(c.sub.length===1, 'a chain survives');
  ok(c.sub[0].company==='Architect 2' && c.sub[0].name==='Architect Review', 'with its step and firm');
  ok(c.sub[0].parallel===true && c.sub[0].requireAll===true, 'and its flags');
  ok(c.sub[0].person==='', 'and nobody named, whatever was sent');
}
ok(WF.cleanWorkflows({sub:[{name:'X',company:'Y',person:'Bob Potter'}]}).sub[0].person==='',
   'a person sent in is dropped \u2014 a step belongs to a firm, and one desk is how a whole office gets stuck');
ok(!WF.cleanWorkflows({sub:[{name:'  '},{company:''},{}]}),
   'steps with neither a name nor a firm are not a chain');
ok(WF.cleanWorkflows({sub:[{name:'A'},{name:'  '},{company:'B'}]}).sub.length===2,
   'and the empty one is dropped from among real ones');
ok(!WF.cleanWorkflows(null) && !WF.cleanWorkflows('nope') && !WF.cleanWorkflows({}),
   'nothing saved at all stays nothing, not a set of empty chains');
ok(!WF.cleanWorkflows({nonsense:[{name:'A'}]}), 'a chain the dashboard does not run is not stored');
ok(!WF.cleanWorkflows({sub:{name:'A',company:'B'}}),
   'and a chain that is not a list of steps is not quietly made into one');
ok(!WF.cleanWorkflows({sub:'Architect Review'}), 'however plausible it looks');
ok(WF.cleanWorkflows({sub:Array.from({length:50},(_,i)=>({name:'S'+i}))}).sub.length===20,
   'and a chain has a ceiling');
ok(WF.cleanWorkflows({sub:[{name:'a/b',company:'c\\d'}]}).sub[0].name==='a b',
   'a slash cannot smuggle a path into a step name');

console.log('A saved chain is what the page draws');
// Read off the markup rather than through getElementById: the harness's DOM
// does not index nodes created by innerHTML, which is how the other workflow
// tests here work too.
P.run(`wfRenderAll('pswf','ps-workflows',{sub:[{name:'Architect Review',company:'Architect 2'},
  {name:'Engineer Review',company:'Next Level Engineers',parallel:true,requireAll:true}]},[]); 1;`);
{
  const h=P.run("document.getElementById('ps-workflows').innerHTML");
  const sub=h.split('id="pswf-sub-rows"')[1].split('id="pswf-payapp_pencil-rows"')[0];
  ok(/class="wf-firm"[^>]*value="Architect 2"/.test(sub), 'the firm that owes the step');
  ok(/class="wf-name"[^>]*value="Architect Review"/.test(sub), 'and what the step is called');
  ok(/value="Next Level Engineers"/.test(sub), 'the second step too');
  ok((sub.match(/class="wf-par" checked/g)||[]).length===1, 'parallel ticked on the one that had it');
  ok((sub.match(/class="wf-all" checked/g)||[]).length===1, 'and all-must-sign likewise');
  ok(!/class="wf-person"/.test(sub), 'nobody named - the step is the firm’s');
  ok(/id="pswf-rfi-rows"/.test(h) && /id="pswf-payapp_final-rows"/.test(h),
     'and every chain the dashboard runs is on the page, not only the one saved');
}

console.log('Nothing saved yet still draws the agreed templates');
P.run(`wfRenderAll('pswf','ps-workflows',null,[]); 1;`);
{
  const h=P.run("document.getElementById('ps-workflows').innerHTML");
  ok(/class="wf-name"[^>]*value="[^"]+"/.test(h),
     'so the panel is never blank - a project has always started from these');
}

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
