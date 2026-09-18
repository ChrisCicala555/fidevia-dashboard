// "For the contractor signature step on the change order, that should really
//  automatically loop back in the submitting contractor."
//
// Yes — and the row could not answer who that was. A change order's Company
// records who typed it up. A contractor raising their own change makes the two
// the same firm, but Fidevia writes up most changes and the architect issues
// some, and for those the row said Fidevia. So the money landed on the CM, the
// number read PCO-CM-001, and a Contractor Signature step would have asked
// Fidevia to sign as the contractor.
//
// Contractor now records whose contract the change is against, and the chain
// carries a placeholder that resolves to it per row instead of a firm named
// once in Settings.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const proxy=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const P=bootPage('index.html'); P.run(SEED);

console.log('Whose contract a change order is against');
{
  const who=o=>P.run(`coContractorOf(${JSON.stringify(o)})`);
  ok(who({'Company':'Fidevia','Contractor':'Summit Builders'})==='Summit Builders',
     'the contract named on the row wins over the firm that filed it');
  ok(who({'Company':'Summit Builders'})==='Summit Builders',
     'a row with no Contractor means what it always meant — the filer');
  ok(who({'Submitted By':'Dave (Summit Builders)'})==='Summit Builders',
     'including one that only records the firm in brackets after a name');
  ok(who({'Company':'Fidevia','Contractor':'   '})==='Fidevia',
     'a blank Contractor is not an answer');
  ok(who({})==='' && who(null)==='', 'and nothing is nothing');
}

console.log('The log has somewhere to put it');
{
  const h=P.run("JSON.stringify(MODULES.co.headers)");
  ok(/"Contractor"/.test(h), 'the change order log carries the column');
  ok(/"Company"/.test(h), 'and still carries the filer separately — they answer different questions');
}

console.log('Who gets asked, and who does not');
{
  ok(P.run("coFilerHoldsContract('Summit Builders')")===true,
     'a contractor holds a contract, so their own filing never asks whose it is');
  ok(P.run("coFilerHoldsContract('Fidevia')")===false, 'Fidevia holds none');
  ok(P.run("coFilerHoldsContract('Beers + Hoffman')")===false, 'nor does the architect');
  ok(P.run("coFilerHoldsContract('')")===false, 'and neither does nobody');

  const opts=JSON.parse(P.run("JSON.stringify(coContractChoices())"));
  ok(opts.length===1 && opts[0].name==='Summit Builders' && opts[0].trade==='GC',
     'the picker offers each contract on the job, with its trade');
  const pick=P.run(`(function(){
    document.getElementById('modal-body').innerHTML=coContractPickerHTML('f-contract');
    const el=document.getElementById('f-contract');
    el.value=${JSON.stringify(opts[0].value)};
    return JSON.stringify(coContractPicked('f-contract')); })()`);
  ok(pick==='{"ok":true,"name":"Summit Builders","trade":"GC"}',
     'and picking one answers with the firm and the contract together');
  const none=P.run(`(function(){ document.getElementById('f-contract').value=''; 
    return JSON.stringify(coContractPicked('f-contract')); })()`);
  ok(JSON.parse(none).ok===false, 'leaving it unanswered is not an answer');
  const junk=P.run(`(function(){ document.getElementById('f-contract').value='Made Up Co␟ZZ';
    return JSON.stringify(coContractPicked('f-contract')); })()`);
  ok(JSON.parse(junk).ok===false, 'and a value that names no contract on this job is refused, not trusted');
}

console.log('The form asks the right question of the right person');
{
  const slot=html.split("const slot=document.getElementById('f-trade-slot');")[1].split('}')[0]
           + html.split("const slot=document.getElementById('f-trade-slot');")[1].slice(0,400);
  ok(/type==='co' && !coFilerHoldsContract\(co\)/.test(slot),
     'the contract picker appears on a change order filed by somebody holding none');
  ok(/tradePickerHTML\('f-trade', co\)/.test(slot),
     'and a contractor still gets the trade picker they had');
}

console.log('What the submission writes');
{
  const src=html.slice(html.indexOf("} else if(currentModal==='co'){"));
  const body=src.slice(0, src.indexOf('sendItemNotif'));
  ok(/'Company':_cc,'Contractor':_against/.test(body),
     'the row records the filer and the contract it is against, both');
  ok(/nextItemNumber\('co', _against, 'pco', _trade\)/.test(body),
     'and is numbered against the contract');
  ok(/if\(!_cp\.ok\) throw/.test(body),
     'a change from somebody holding no contract cannot be filed without naming one');
  ok(/_held/.test(body), 'the two paths are told apart by whether the filer holds a contract');
}

console.log('The chain resolves the signer per row');
{
  // The signature step lives on the execution chain, so every row here carries
  // a change order number: that is what tells the two chains apart.
  const steps=(row, key)=>JSON.parse(P.run(`(function(){
    currentProject.config.workflows.co_pco=[{name:'Fidevia Review',company:'Fidevia'}];
    currentProject.config.workflows.co_final=[{name:'Fidevia Countersign',company:'Fidevia'},
      {name:'Contractor Signature',company:'(submitting contractor)'}];
    currentProject.config.workflows.rfi=[{name:'Back to the filer',company:'(submitting contractor)'}];
    return JSON.stringify(wfEffectiveSteps(${JSON.stringify(key||'co')}, ${JSON.stringify(row)})
      .map(s=>({name:s.name, company:s.company, sub:!!s.submitterStep}))); })()`));
  const CO={'CO #':'CO-GC-001'};
  const co=(o)=>Object.assign({}, CO, o);

  const a=steps(co({'Company':'Fidevia','Contractor':'Summit Builders','Workflow Step':'0'}));
  ok(a[1].company==='Summit Builders',
     'a change Fidevia wrote up is signed by the contractor whose contract it changes');
  ok(a[1].sub===true, 'and the step knows it was resolved rather than typed');
  ok(a[0].company==='Fidevia', 'the step that does name a firm is left exactly as it was');

  const b=steps(co({'Company':'Summit Builders','Workflow Step':'0'}));
  ok(b[1].company==='Summit Builders',
     'a contractor raising their own change signs it themselves, from the same chain');

  const c=steps(co({'Company':'Summit Builders','Contractor':'','Submitted By':'Dave (Summit Builders)','Workflow Step':'0'}));
  ok(c[1].company==='Summit Builders', 'and so does a row written before the column existed');

  const r=steps({'Company':'Summit Builders','Workflow Step':'0'}, 'rfi');
  ok(r[0].company==='Summit Builders',
     'on a log with no Contractor column it means the submitter, which is what it reads as there');

  const none=steps(co({'Workflow Step':'0'}));
  ok(none[1].company==='', 'a row naming nobody resolves to nobody rather than to a stray firm');

  // And the proposal chain does not ask anybody to sign.
  const prop=steps({'PCO #':'PCO-GC-001','Company':'Summit Builders','Workflow Step':'0'});
  ok(prop.length===1 && prop[0].name==='Fidevia Review',
     'a proposal runs the review chain and nothing else \u2014 nobody signs a price still being argued');
}

console.log('Including on a chain somebody has added to');
{
  // A re-review, a further reviewer, a step handed over: the chain grows, and a
  // grown chain returns down a different path. Both paths have to resolve, or
  // the signature step dies the moment anybody adds a reviewer.
  const out=JSON.parse(P.run(`(function(){
    currentProject.config.workflows.co_final=[{name:'Fidevia Countersign',company:'Fidevia'},
      {name:'Contractor Signature',company:'(submitting contractor)'}];
    const row={'CO #':'CO-GC-001','Company':'Fidevia','Contractor':'Summit Builders','Workflow Step':'0',
      'Workflow Extra':JSON.stringify([{after:0,name:'Further Review',company:'Beers + Hoffman'}])};
    return JSON.stringify(wfEffectiveSteps('co', row).map(s=>({name:s.name, company:s.company}))); })()`));
  ok(out.length===3, 'the added reviewer is in the chain');
  const sig=out.find(s=>/Contractor Signature/.test(s.name));
  ok(sig && sig.company==='Summit Builders',
     'and the signature step still resolves to the contractor');
  ok(out.some(s=>s.company==='Beers + Hoffman'), 'while the added step keeps the firm it was added for');
}

console.log('A resolved step belongs to that contractor');
{
  const mine=P.run(`(function(){
    currentProject.config.workflows.co_final=[{name:'Contractor Signature',company:'(submitting contractor)'}];
    ME_COMPANY='Summit Builders'; ME_EMAIL='d@s.test';
    const st=wfEffectiveSteps('co', {'CO #':'CO-GC-001','Company':'Fidevia','Contractor':'Summit Builders','Workflow Step':'0'})[0];
    const r=wfStepIsMine(st); ME_COMPANY='Fidevia'; ME_EMAIL='cc@fidevia.com'; return r; })()`);
  ok(mine===true, 'the contractor can act on it — the whole point, and a blank step matched nobody');
}

console.log('The shipped default uses it');
{
  const sig=JSON.parse(P.run("JSON.stringify(WF_TEMPLATES.co_final.find(s=>/contractor signature/i.test(s.name)))"));
  ok(P.run(`wfIsSubmitterToken(${JSON.stringify(sig.company)})`)===true,
     'a new project starts with Contractor Signature resolving per change order');
  // WF_TEMPLATES is evaluated at load and the constant is declared further down
  // the file, so it is written there as the literal. These two drifting apart
  // is a silent dead step, which is exactly what this replaced.
  ok(P.run("wfIsSubmitterToken(WF_SUBMITTER_TOKEN)")===true, 'the constant is its own token');
  ok(sig.company===P.run("WF_SUBMITTER_TOKEN"), 'and the literal in the template is that constant');
}

console.log('The server reads it the same way');
{
  ok(/SUBMITTER_STEP\s*=\s*\/\^\\\(\?\\s\*submitting contractor\\s\*\\\)\?\$\/i/.test(proxy),
     'the server matches the same token');
  const clientRe=(html.match(/return \/\^\\\(\?\\s\*submitting contractor\\s\*\\\)\?\$\/i\.test/)||[])[0];
  ok(!!clientRe, 'and so does the page, by the same pattern');
  ok(/resolveSubmitterSteps\(wfForCompany\(rowCompanyOf\(row\)\), row\)/.test(proxy),
     'the steps the server authorises against are resolved before it checks them');
  ok(/direct \|\| rowCompanyOf\(r\)/.test(proxy),
     'resolving to Contractor, falling back to the filer, exactly as the page does');
  ok(/theirs\.includes\(mine\)/.test(proxy),
     'and a contractor may act on a row against their contract, not only one they filed');
  ok(/\[row\['Company'\], row\['Contractor'\]\]/.test(proxy), 'both names count as theirs');
}

console.log('The money follows the contract');
{
  const r=P.run(`(function(){
    allData.co=[{'PCO #':'PCO-GC-001','CO #':'CO-GC-001','Description':'Slab',
      'Company':'Fidevia','Contractor':'Summit Builders','Trade':'GC',
      'Cost Impact':'10000','Approved Amount':'10000','Status':'Approved',
      'Date Submitted':'2026-09-02','Date Approved':'2026-09-03','Version History':'[]'}];
    return JSON.stringify({
      summit: coContractImpactFor('Summit Builders'),
      fidevia: coContractImpactFor('Fidevia'),
      onLine: (function(){ const l=contractorLines()[0]; return rowOnLine(allData.co[0], l); })()
    }); })()`);
  const m=JSON.parse(r);
  ok(m.summit===10000, "a change Fidevia wrote up counts against the contractor's contract");
  ok(m.fidevia===0, 'and not against Fidevia, who holds no contract to change');
  ok(m.onLine===true, 'the row is billed against that contract line');
}

console.log('And so does the arithmetic printed on the document');
{
  const m=JSON.parse(P.run(`(function(){
    allData.co=[
      {'PCO #':'PCO-GC-001','CO #':'CO-GC-001','Description':'Earlier','Company':'Fidevia',
       'Contractor':'Summit Builders','Trade':'GC','Cost Impact':'5000','Approved Amount':'5000',
       'Status':'Approved','Date Submitted':'2026-08-01','Date Approved':'2026-08-02','Version History':'[]'},
      {'PCO #':'PCO-GC-002','CO #':'CO-GC-002','Description':'This one','Company':'Fidevia',
       'Contractor':'Summit Builders','Trade':'GC','Cost Impact':'10000','Approved Amount':'10000',
       'Status':'Approved','Date Submitted':'2026-09-02','Date Approved':'2026-09-03','Version History':'[]'}];
    const r=coContractMathFor(allData.co[1], []);
    return JSON.stringify({original:r.original, previous:r.previous}); })()`));
  ok(m.original===2000000,
     "the contract the change order prints is the contractor's, not the blank Fidevia holds");
  ok(m.previous===5000, 'and the changes before it are the ones on that contract');
}

console.log('It is numbered against the contract too');
{
  const num=P.run(`nextItemNumber('co','Summit Builders','pco','GC')`);
  ok(/^PCO-GC-/.test(num), 'the run is the prime’s, not the CM’s');
  ok(num==='PCO-GC-003', 'and continues past the two changes already on that contract');
}

console.log('Who filed it is still what the log shows');
{
  const cell=P.run(`submitterCell({'Company':'Fidevia','Contractor':'Summit Builders','Submitted By':'Chris Cicala'})`);
  ok(/Fidevia/.test(cell), 'the Submitted By column names whoever actually filed it');
  ok(!/Summit/.test(cell), 'and does not quietly rewrite that into the contractor');
}

console.log(bad?`\n${bad}/${n} failed`:`\n${n} checks passed`);
process.exit(bad?1:0);
