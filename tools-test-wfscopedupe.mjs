// "Workflows - are we differentiating by contract?"
//
// No. A review chain is stored against a company name, so when a firm holds two
// primes the picker listed them twice and both rows pointed at the same chain:
// setting one silently replaced the other. The answer chosen was to keep one
// chain per firm and stop showing the second row.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P=bootPage('index.html'); P.run(SEED);

const optsOf = h => String(h||'').split('<option').length-1;
const labels = h => String(h||'').match(/>([^<]*)<\/option>/g)||[];

console.log('The helper keeps one row per firm');
{
  const f = a => P.run(`JSON.stringify(wfScopeFirms(${JSON.stringify(a)}))`);
  ok(f(['Summit Builders','Summit Builders'])==='["Summit Builders"]',
     'the same firm twice is one firm');
  ok(f(['Summit Builders','summit builders'])==='["Summit Builders"]',
     'however the two contract lines spell it, and the first spelling is the one shown');
  ok(f(['A','B','A','C'])==='["A","B","C"]',
     'the others keep their order — the list is not sorted out from under anyone');
  ok(f(['A','','  ','B'])==='["A","B"]', 'a line with no company on it is not a row');
  ok(f(null)==='[]' && f([])==='[]', 'and nothing in is nothing out');
  ok(f([' Summit Builders ','Summit Builders'])==='["Summit Builders"]',
     'stray spacing is not a second firm');
}

console.log('The project Settings picker');
{
  const run = cts => P.run(`(function(){
    currentProject = { config: { contractors: ${JSON.stringify(cts)}, workflowsByCompany: {} } };
    WF_SCOPE='';
    wfScopeOptions();
    return document.getElementById('wf-scope').innerHTML; })()`);

  const two = run([{name:'Summit Builders',trade:'GC'},{name:'Summit Builders',trade:'MC'},{name:'Kinsley',trade:'EC'}]);
  ok(optsOf(two)===3, 'a firm on two primes is offered once: the default, Summit, Kinsley');
  ok((two.match(/value="Summit Builders"/g)||[]).length===1, 'Summit is offered a single time');
  ok(/Kinsley/.test(two), 'and nobody else is dropped on the way');

  const off = run([{name:'Summit Builders',active:false},{name:'Kinsley'}]);
  ok(!/Summit/.test(off), 'an inactive contract line is still left out');

  const none = run([]);
  ok(optsOf(none)===1, 'with no contractors there is only the default');
}

console.log('Whichever line is picked addresses the one chain');
{
  const r = P.run(`(function(){
    currentProject = { config: { contractors: [{name:'Summit Builders',trade:'GC'},{name:'Summit Builders',trade:'MC'}],
      workflowsByCompany: { 'Summit Builders': { rfi:[{role:'Fidevia'}] } } } };
    WF_SCOPE='';
    wfScopeOptions();
    return document.getElementById('wf-scope').innerHTML; })()`);
  ok((r.match(/custom/g)||[]).length===1,
     'the firm with a chain is marked custom once, not once per contract');
  ok(optsOf(r)===2, 'and is one row');
}

console.log('The wizard picker');
{
  const run = cts => P.run(`(function(){
    wizGatherContractors=function(){ return ${JSON.stringify(cts)}; };
    NPWF_SCOPE=''; NPWF_BYCO={};
    wizWfScopeOptions();
    return document.getElementById('npwf-scope').innerHTML; })()`);

  const two = run([{name:'Garden Spot',trade:'MC'},{name:'Garden Spot',trade:'PC'},{name:'Kinsley',trade:'EC'}]);
  ok(optsOf(two)===3, 'the same is true before the project exists');
  ok((two.match(/value="Garden Spot"/g)||[]).length===1,
     'a firm holding the mechanical and the plumbing is one row, not two');

  const blank = run([{name:''},{name:'Kinsley'}]);
  ok(optsOf(blank)===2, 'an unnamed line is not offered');
}

console.log('The hint counts firms, not contracts');
{
  const h = P.run(`(function(){
    wizGatherContractors=function(){ return [{name:'Garden Spot'},{name:'Garden Spot'}]; };
    NPWF_SCOPE=''; NPWF_BYCO={};
    wizWfScopeOptions();
    return document.getElementById('npwf-scope-hint').innerHTML; })()`);
  ok(/Pick a contractor above/.test(h),
     'one firm on two primes is still a contractor you can single out');
}

console.log(bad?`\n${bad}/${n} failed`:`\n${n} checks passed`);
process.exit(bad?1:0);
