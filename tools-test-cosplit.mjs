// "I would like to bifurcate the change order process to be PCO and then CO
//  exactly like how we do with the payment applications."
//
// One chain ran over both, so signature steps sat on a proposal: a signature on
// a price nobody had agreed, which is the mistake the pencil copy taught us on
// a payment application. Two chains now. Which one a row runs is decided by
// whether it carries a change order number, the way a payment application is
// decided by its copy type.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const proxy=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const P=bootPage('index.html'); P.run(SEED);

console.log('Which chain a row runs');
{
  const k=r=>P.run(`wfCfgKey('co', ${JSON.stringify(r)})`);
  ok(k({'PCO #':'PCO-GC-001'})==='co_pco', 'a proposal runs the proposal chain');
  ok(k({'PCO #':'PCO-GC-001','CO #':'CO-GC-001'})==='co_final',
     'and the same row runs the execution chain once it carries a change order number');
  ok(k({'CO #':'CO-GC-001'})==='co_final', 'a change order raised with no proposal behind it starts there');
  ok(k({})==='co_pco', 'a row with neither number is a proposal');
  ok(k({'CO #':'   '})==='co_pco', 'and blank is not a number');
  // The same shape as the payment application split, which is the point.
  ok(P.run("wfCfgKey('pay_apps',{'Copy Type':'Pencil'})")==='payapp_pencil',
     'the pencil copy still resolves the way it did');
}

console.log('Two chains to configure, not one');
{
  const t=P.run("JSON.stringify(WF_TYPES.map(x=>x[0]))");
  ok(/"co_pco"/.test(t) && /"co_final"/.test(t), 'Settings offers both');
  ok(!/"co"/.test(t), 'and no longer offers the single one that ran over both');
  const lbl=P.run("JSON.stringify(WF_TYPES.find(x=>x[0]==='co_pco')[1])");
  ok(/Proposal/.test(lbl), 'named so it is obvious which is which');
}

console.log('The shipped defaults');
{
  const pco=JSON.parse(P.run("JSON.stringify(WF_TEMPLATES.co_pco)"));
  const fin=JSON.parse(P.run("JSON.stringify(WF_TEMPLATES.co_final)"));
  ok(pco.every(s=>!/signature/i.test(s.name)), 'nobody signs a proposal');
  ok(fin.every(s=>/signature/i.test(s.name)), 'and the execution chain is signatures only');
  ok(fin.every(s=>!/generat|issue/i.test(s.name)),
     'with no step for issuing it — issuing is the trigger, and is done before anybody sees the row');
  ok(/contractor signature/i.test(fin[0].name), 'the contractor signs first');
  ok(P.run(`wfIsSubmitterToken(${JSON.stringify(fin[0].company)})`),
     'and is whoever the change is against, resolved per row');
  ok(/owner signature/i.test(fin[fin.length-1].name), 'the owner signs last');
  ok(!P.run("!!WF_TEMPLATES.co"), 'the old combined template is gone rather than left to rot');
}

console.log('A project configured before the split keeps working');
{
  const legacy=[{name:'Fidevia Review'},{name:'Architect Review',parallel:true},
                {name:'Contractor Signature'},{name:'Fidevia Signature'},{name:'Owner Signature'}];
  const half=w=>JSON.parse(P.run(
    `JSON.stringify(wfFromConfig({co:${JSON.stringify(legacy)}}, ${JSON.stringify(w)}).map(s=>s.name))`));
  ok(half('co_pco').join()==='Fidevia Review,Architect Review',
     'the review steps become the proposal chain');
  ok(half('co_final').join()==='Contractor Signature,Fidevia Signature,Owner Signature',
     'and everything from the first signature becomes the execution chain');
  ok(JSON.parse(P.run(`JSON.stringify(wfFromConfig({co:${JSON.stringify(legacy)},co_pco:[{name:'Mine'}]},'co_pco').map(s=>s.name))`)).join()==='Mine',
     'a chain actually saved under the new key wins over the cut');
  // Nothing is rewritten in Box: the cut happens on read, so a project keeps
  // running before anybody opens Settings.
  ok(!/workflows\.co_pco\s*=/.test(html.split('function wfFromConfig')[1].slice(0,600)),
     'and the stored config is not rewritten to do it');

  const noSig=[{name:'Fidevia Review'},{name:'Architect Review'}];
  ok(JSON.parse(P.run(`JSON.stringify(wfFromConfig({co:${JSON.stringify(noSig)}},'co_pco').map(s=>s.name))`)).length===2,
     'a chain naming no signature at all is all proposal');
  ok(JSON.parse(P.run(`JSON.stringify(wfFromConfig({co:${JSON.stringify(noSig)}},'co_final'))`)).length===0,
     'and leaves the execution chain empty rather than inventing one');
}

console.log('End to end, on one project');
{
  const r=JSON.parse(P.run(`(function(){
    currentProject.config.workflows.co=[{name:'Fidevia Review',company:'Fidevia'},
      {name:'Architect Review',company:'Beers + Hoffman',parallel:true},
      {name:'Contractor Signature',company:'(submitting contractor)'},
      {name:'Fidevia Signature',company:'Fidevia',requireAll:true},
      {name:'Owner Signature',company:'Ithaca'}];
    const as=(row)=>wfEffectiveSteps('co',row).map(s=>s.name+' → '+s.company);
    return JSON.stringify({
      proposal: as({'PCO #':'PCO-GC-001','Company':'Summit Builders','Workflow Step':'0'}),
      order:    as({'CO #':'CO-GC-001','Contractor':'Summit Builders','Company':'Fidevia','Workflow Step':'0'})
    }); })()`));
  ok(r.proposal.length===2 && !r.proposal.some(x=>/Signature/.test(x)),
     'the proposal is reviewed by Fidevia and the architect, and signed by nobody');
  ok(r.order.length===3 && r.order.every(x=>/Signature/.test(x)),
     'the change order is signatures only');
  ok(r.order[0]==='Contractor Signature → Summit Builders',
     'and the contractor asked to sign is the one whose contract the change is against');
}

console.log('The change order row starts that chain');
{
  const sb=html.split('async function submitNewCo(){')[1].split('\n}')[0];
  ok(/row\['Workflow Step'\]='0'/.test(sb), 'from the top');
  ok(/row\['Workflow Done'\]='\[\]'/.test(sb) && /row\['Workflow Signed'\]='\{\}'/.test(sb),
     'with nothing ticked — the reviews belong to the proposal row, not to this one');
  ok(/_sig\.length \? 'In Review' : 'Complete'/.test(sb),
     'and where a project has configured no signature chain the row is complete on arrival, as before');
  ok(/row\['Contractor'\]=co/.test(sb), 'carrying the contract, which is who the signature step resolves to');
}

console.log('Generating still asks about the PROPOSAL’s reviews');
{
  // The warning before generating is about the review that justifies the change
  // order. Asked of a row that already has a number, the chain would answer
  // about signatures nobody has collected yet.
  const f=html.split('function coGenNeedsReview')[1].split('\nfunction ')[0];
  ok(/'CO #':''/.test(f), 'so it is asked of the row as a proposal');
  const out=P.run(`(function(){
    currentProject.config.workflows.co=[{name:'Fidevia Review',company:'Fidevia'},
      {name:'Contractor Signature',company:'(submitting contractor)'}];
    return coGenNeedsReview({'CO #':'CO-GC-001','PCO #':'PCO-GC-001','Status':'Approved',
      'Contractor':'Summit Builders','Workflow Step':'0','Workflow Done':'[]','Workflow Signed':'{}'}).length; })()`);
  ok(out===1, 'an unreviewed proposal is still flagged once its change order number exists');
}

console.log('The server resolves the same two chains');
{
  ok(/LEGACY_SPLIT = \{ co_pco:\['co',true\], co_final:\['co',false\]/.test(proxy),
     'the server cuts a pre-split change order chain the same way');
  ok(/payapp_pencil:\['payapp',true\], payapp_final:\['payapp',false\]/.test(proxy),
     'and the payment application one, which had no server-side fallback at all before this');
  ok(/const arr = fromSet\(byCo\[ck\]\); if \(arr\.length\) return arr;/.test(proxy),
     'a per-contractor override gets the cut too');
  {
    // Declaring the table and not reading it is the same as not having it, and
    // fails the way that matters: "No workflow configured" on every review.
    const fs0=proxy.split('const fromSet =')[1].split('};')[0];
    ok(/LEGACY_SPLIT\[wfKey\]/.test(fs0), 'and the table is actually read when the new key is empty');
    ok(/splitAtSignature\(set\[leg\[0\]\], leg\[1\]\)/.test(fs0), 'to cut the chain saved under the old one');
  }
  ok(/'co', 'co_pco', 'co_final'/.test(proxy),
     'and the settings store keeps both keys, plus the retired one it must not throw away');
}

console.log(bad?`\n${bad}/${n} failed`:`\n${n} checks passed`);
process.exit(bad?1:0);
