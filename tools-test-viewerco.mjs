// "Can we change the external viewer to reflect the MC, GC, contract roles for
//  the contractors?"
//
// Garden Spot Mechanical was in the picker twice, because they hold the
// mechanical and the plumbing. But access is granted to a COMPANY — somebody
// signed in for Garden Spot sees both contracts — so the two entries previewed
// the identical screen, and choosing between them implied a difference the
// grant does not have. One entry now, named with the contracts it covers.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage('index.html'); P.run(SEED);

const opts=cts=>P.run(`(function(){
  currentProject.config.contractors=${JSON.stringify(cts)};
  EXTERNAL=false; VIEWER_COMPANY='';
  setViewer('external');
  return document.getElementById('viewer-company').innerHTML; })()`);
const count=h=>h.split('<option').length-1;

console.log('One entry per firm');
{
  const h=opts([{name:'LA Building Contractors',role:'GC'},
                {name:'Garden Spot Mechanical',role:'MC'},
                {name:'Garden Spot Mechanical',role:'PC'},
                {name:"Cook's Service Company",role:'EC'}]);
  ok(count(h)===4, 'All companies plus three firms — not four contracts');
  ok((h.match(/value="Garden Spot Mechanical"/g)||[]).length===1,
     'the firm holding two primes is offered once');
  ok(/All companies/.test(h), 'and the unscoped option is still first');
}

console.log('Named with the contracts it covers');
{
  const h=opts([{name:'Garden Spot Mechanical',role:'MC'},
                {name:'Garden Spot Mechanical',role:'PC'},
                {name:'LA Building Contractors',role:'GC'}]);
  ok(/Garden Spot Mechanical — MC · PC</.test(h),
     'a firm on two primes names both, so it reads as one party with two contracts');
  ok(/LA Building Contractors — GC</.test(h), 'and a firm on one names it');
  ok(!/All companies —/.test(h), 'the unscoped option takes no contract label');
}

console.log('The value is still the company, because the grant is');
{
  const h=opts([{name:'Garden Spot Mechanical',role:'MC'},{name:'Garden Spot Mechanical',role:'PC'}]);
  ok(/value="Garden Spot Mechanical"/.test(h), 'the option carries the firm name');
  ok(!/value="Garden Spot Mechanical —/.test(h),
     'and not the label — companyScope matches on the name, so a decorated value would scope to nobody');
  const pick=P.run(`(function(){ const el=document.getElementById('viewer-company');
    el.value='Garden Spot Mechanical'; VIEWER_COMPANY=el.value;
    document.body.classList.add('external-mode');
    VIEWER_ROLE='contractor';
    const r=viewingAsCompany(); document.body.classList.remove('external-mode'); return r; })()`);
  ok(pick==='Garden Spot Mechanical', 'so picking one scopes the preview to that firm');
}

console.log('Nothing else about the picker moved');
{
  const h=opts([{name:'Gone',role:'GC',active:false},{name:'Here',role:'MC'}]);
  ok(!/value="Gone"/.test(h), 'a contract taken off the job is not offered');
  ok(/value="Here"/.test(h), 'and the rest are');
  const none=opts([]);
  ok(count(none)===1, 'a project with no contractors offers only All companies');
  const blank=opts([{name:'',role:'GC'},{name:'Real',role:'MC'}]);
  ok(count(blank)===2, 'and an unnamed contract line is not a firm');

  const src=html.split('function setViewer(mode)')[1].slice(0,1400);
  ok(/wfScopeFirms\(cts\.map\(c=>c\.name\)\)/.test(src), 'the list is deduped by firm');
  ok(/contractLabelFor\(nm\)/.test(src), 'and labelled from the contracts that firm holds');
  ok(/VIEWER_COMPANY===nm/.test(src), 'a firm already being previewed stays selected');
}

console.log(bad?`\n${bad}/${n} failed`:`\n${n} checks passed`);
process.exit(bad?1:0);
