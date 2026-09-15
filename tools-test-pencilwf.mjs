// "Think we should almost delineate between a pencil and final copy in the
// actual workflows."
//
// Right: they are not the same thing to review. A pencil is worked through —
// amounts read off the document, figures argued, markup returned. The final is
// signed. One chain over both put signature steps on a draft, which is a
// signature on a number nobody has agreed yet.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
const names=a=>(a||[]).map(x=>x.name).join(' | ');
const LEGACY=[{name:'Fidevia Records Amounts',person:'CC'},{name:'Fidevia Review',person:'CC'},
  {name:'Architect Review',person:'TA',parallel:true},{name:'Fidevia Signature',person:'CC'},
  {name:'Architect Signature',person:'TA'}];
const setWf=(o)=>P.run('currentProject.config.workflows='+JSON.stringify(o)+';');
const steps=(copy)=>P.run(`wfSteps('pay_apps',${JSON.stringify(copy===null?{}:{'Copy Type':copy})})`);

console.log('Two chains, chosen by the row');
{
  setWf({payapp_pencil:[{name:'Reads amounts'}], payapp_final:[{name:'Signs'}]});
  ok(names(steps('Pencil'))==='Reads amounts', 'a pencil runs the pencil chain');
  ok(names(steps('Final'))==='Signs', 'a final runs the final chain');
  ok(names(steps(null))==='Signs', 'a row with no copy type is a final — that is what older rows are');
  ok(P.run(`wfCfgKey('pay_apps',{'Copy Type':'Pencil'})`)==='payapp_pencil', 'the key follows the row');
  ok(P.run(`wfCfgKey('rfi',{'Copy Type':'Pencil'})`)==='rfi', 'and no other module is affected by the column');
}

console.log('An existing chain is cut where the signing starts');
{
  setWf({payapp:LEGACY});
  ok(names(steps('Pencil'))==='Fidevia Records Amounts | Fidevia Review | Architect Review',
     'the review steps become the pencil chain — got '+names(steps('Pencil')));
  ok(names(steps('Final'))==='Fidevia Signature | Architect Signature',
     'and the signature steps the final one');
  ok(steps('Pencil').length + steps('Final').length === LEGACY.length,
     'every step lands somewhere — none is dropped in the split');
  ok(steps('Pencil')[2].parallel===true, 'and each keeps its own settings');
}
{
  // The old default chain ended in a step called Signed.
  setWf({payapp:[{name:'Fidevia Records Amounts'},{name:'Fidevia Review'},
                 {name:'Architect Review',parallel:true},{name:'Signed'}]});
  ok(names(steps('Final'))==='Signed', 'a step called Signed starts the final chain too');
  ok(steps('Pencil').length===3, 'leaving the three reviews on the pencil');
}
{
  // A chain with no signing step named is all review.
  setWf({payapp:[{name:'Fidevia Review'},{name:'Architect Review'}]});
  ok(steps('Pencil').length===2, 'a chain that never signs is entirely a pencil chain');
  ok(steps('Final').length===0, 'and the final chain is left to be built rather than guessed at');
}
{
  // Explicit beats inherited.
  setWf({payapp:LEGACY, payapp_pencil:[{name:'Mine'}]});
  ok(names(steps('Pencil'))==='Mine', 'a chain set by hand is used ahead of the split');
  ok(names(steps('Final'))==='Fidevia Signature | Architect Signature',
     'while the other half still comes from the old one until it is set');
}

console.log('What the Settings screen shows');
{
  const r=html.slice(html.indexOf('function wfRenderAll'), html.indexOf('function wfGather'));
  ok(/wfFromConfig\(workflows\|\|\{\}, k\)/.test(r),
     'Settings renders the chains the project is running, split included');
  ok(!/\(workflows&&workflows\[k\]\) \|\| \(WF_TEMPLATES/.test(r),
     'rather than the raw key, which would have shown defaults and overwritten the real chain on save');
  ok(/live\.length \? live :/.test(r), 'falling back to a template only when there is genuinely nothing');
}
{
  const t=html.slice(html.indexOf('const WF_TYPES='), html.indexOf('// The chains a new project'));
  ok(/'payapp_pencil','Payment Applications — Pencil Copy'/.test(t), 'the pencil chain has its own block');
  ok(/'payapp_final','Payment Applications — Final Copy'/.test(t), 'and so does the final');
  ok(!/\['payapp','Payment Applications'\]/.test(t), 'the single combined block is gone');
}

console.log('The defaults a new project starts with');
{
  const pen=P.run(`WF_TEMPLATES.payapp_pencil.map(x=>x.name)`);
  const fin=P.run(`WF_TEMPLATES.payapp_final.map(x=>x.name)`);
  ok(pen.join(' | ')==='Fidevia Records Amounts | Fidevia Review | Architect Review',
     'a pencil is worked through — got '+pen.join(' | '));
  ok(fin.join(' | ')==='Fidevia Signature | Architect Signature', 'and a final is signed');
  ok(!pen.some(x=>/signature/i.test(x)), 'nobody signs a pencil copy, which is the point of splitting them');
  ok(P.run(`WF_TEMPLATES.payapp_final.every(x=>x.requireAll===true)`)===true,
     'and both signatures are required, as a signature step should be');
}

console.log('Per-contractor overrides follow');
{
  P.run(`currentProject.config.contractors=[{name:'Summit Builders',role:'GC',active:true}];
         currentProject.config.workflowsByCompany={'Summit Builders':{payapp_pencil:[{name:'Their pencil'}]}};`);
  setWf({payapp_pencil:[{name:'Default pencil'}], payapp_final:[{name:'Default final'}]});
  const row=(c)=>({'Company':'Summit Builders','Copy Type':c});
  ok(names(P.run(`wfStepsFor('pay_apps','Summit Builders',${JSON.stringify(row('Pencil'))})`))==='Their pencil',
     'an override applies to the chain it was set on');
  ok(names(P.run(`wfStepsFor('pay_apps','Summit Builders',${JSON.stringify(row('Final'))})`))==='Default final',
     'and the other half falls through to the project default');
  ok(P.run(`wfHasOverride('Summit Builders','pay_apps')`)===true,
     'and the contractor counts as having an override');
}
{
  P.run(`currentProject.config.workflowsByCompany={'Summit Builders':{payapp:${JSON.stringify(LEGACY)}}};`);
  const row=(c)=>({'Company':'Summit Builders','Copy Type':c});
  ok(names(P.run(`wfStepsFor('pay_apps','Summit Builders',${JSON.stringify(row('Final'))})`))==='Fidevia Signature | Architect Signature',
     'an override written before the split is cut the same way');
  ok(P.run(`wfHasOverride('Summit Builders','pay_apps')`)===true, 'and still counts');
}

console.log('Which chain the form promises');
{
  const f=html.slice(html.indexOf('const _wfRow = (key===\'pay_apps\')'));
  ok(/currentModal==='payapp_ext' \? \(segValue\('f-copytype'\)\|\|'Pencil'\) : 'Final'/.test(f.slice(0,300)),
     'the upload form works out which chain is next from the choice on screen, '
     +'so a pencil is not told a signature step is coming');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-pencilwf.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
