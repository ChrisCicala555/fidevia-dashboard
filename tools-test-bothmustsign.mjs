// Two things a review chain must not do: tick a box nobody ticked, and let one
// reviewer answer for another.
//
// A contractor resubmitting moved the chain past the architect and the
// engineer, and the panel then drew both of their reviews as approved. Neither
// had done anything — the tick was inferred from position on an item with no
// signature record. And a parallel group advanced on whoever answered first, so
// an architect approving an RFI carried it past an engineer who had not read
// it.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const IDF={rfi:'RFI #',sub:'Submittal #'};
const setup=key=>b.run(`allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
  {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test'},
  {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'}];
  currentProject.config.workflows.${key}=[{name:'Architect Review',person:'Test Architect',email:'a@x.test'},
    {name:'Engineer Review',person:'Penelope Odiem',email:'p@y.test',parallel:true}];
  allData.${key}=[{'${IDF[key]}':'X-001','Subject':'s','Description':'d',
    'Submitted By':'gc@s.test (Summit Builders)','Submitted By (Sub)':'gc@s.test (Summit Builders)',
    'Company':'Summit Builders','Status':'Open','Workflow Step':'0','Workflow Status':'In Review',
    'Version History':'[]','Workflow Extra':'','Workflow Signed':''}]; DATA_READY=true;`);
const as=(email,co,role,name)=>b.run(`EXTERNAL=true;IS_ADMIN=false;ME_EMAIL='${email}';ME_NAME='${name||''}';
  ME_COMPANY='${co}';currentProject.userCompany='${co}';currentProject.userRole='${role}';`);
const act=(key,status)=>b.run(`openReply('${key}',0,true);
  document.getElementById('reply-action').value='continue';
  document.getElementById('reply-status').value=${JSON.stringify(status)};
  applyReviewAdvance('${key}', allData.${key}[0], ME_NAME||ME_EMAIL);`);
const panel=key=>b.run(`wfProgressHTML('${key}',allData.${key}[0],0)`).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

console.log('Both reviewers must answer — and RFIs and submittals answer alike');
for(const key of ['rfi','sub']){
  setup(key);
  as('a@x.test','Architect 2','architect','Test Architect'); act(key,'Approved');
  ok(b.run(`allData.${key}[0]['Workflow Status']`)==='In Review',
     key+': one approval does not finish a two-person group');
  ok(b.run(`allData.${key}[0]['Workflow Step']`)==='0', key+': and does not move the chain past it');
  ok(/Awaiting you and Penelope Odiem|Awaiting: Penelope Odiem/.test(panel(key)),
     key+': the panel still asks for the other one');
  ok(!/✓ Engineer Review/.test(panel(key)), key+': the engineer is not ticked off by somebody else');
  as('p@y.test','Next Level Engineers','engineer','Penelope Odiem'); act(key,'Approved');
  ok(b.run(`allData.${key}[0]['Workflow Status']`)==='Complete', key+': both approvals finish it');
  ok((panel(key).match(/✓/g)||[]).length===2, key+': with a tick each, and only for the two who gave one');
}

console.log('A tick means somebody approved');
setup('rfi');
b.run(`allData.rfi[0]['Workflow Step']='2'; allData.rfi[0]['Status']='Resubmitted'; allData.rfi[0]['Workflow Signed']='';
  allData.rfi[0]['Workflow Extra']=JSON.stringify([{after:1,name:'Revise and Resubmit',person:'Test Contractor',
    company:'Summit Builders',email:'gc@s.test',returned:true}]);`);
as('gc@s.test','Summit Builders','contractor','Test Contractor');
{
  const p=panel('rfi');
  ok(!/✓/.test(p), 'a resubmission past two reviewers ticks neither of them');
  ok((p.match(/no approval on record/g)||[]).length===2,
     'each says so plainly instead');
  ok(/recorded before each one was attributed/.test(p),
     'and the item still explains why it cannot say who signed');
}
ok(/const isDone = sig \? !returned : false;/.test(html),
   'nothing infers an approval from position any more');
ok(/const isUnknown = !sig && passed && !attributed;/.test(html),
   'passed-without-a-signature is its own state');
ok(/const isSkipped = !sig && passed && attributed;/.test(html),
   'told apart from a step the group genuinely moved past');

console.log('The rule, in both places that enforce it');
ok(/function wfGroupNeedsAll\(steps, gs, ge\)\{\s*\n\s*if\(ge>gs\) return true;/.test(html),
   'a group of more than one needs all of them');
ok((html.match(/wfGroupNeedsAll\(/g)||[]).length===3,
   'defined once and used by both the reply path and the approve path');
ok(/const groupNeedsAll = \(ge > gs\) \|\| steps\.slice\(gs, ge \+ 1\)\.some\(st => st && st\.requireAll\);/.test(srv),
   'and the server says the same, so an external user cannot advance past it');
ok(/requireAll/.test(html.split('function wfGroupNeedsAll')[1].split('\nfunction ')[0]),
   'requireAll is still honoured for a step standing on its own');

console.log('Standing in is not the same as being recorded by address');
{
  setup('sub');
  as('a@x.test','Architect 2','architect','');   // no display name loaded
  act('sub','Approved');
  const sig=JSON.parse(b.run("JSON.stringify(wfSignedMap(allData.sub[0]))"))['0'];
  ok(sig && !sig.forName,
     'the named reviewer recorded under their own address is not marked as standing in for themselves');
  setup('sub');
  as('a2@x.test','Architect 2','architect','Second Architect');
  act('sub','Approved');
  const sig2=JSON.parse(b.run("JSON.stringify(wfSignedMap(allData.sub[0]))"))['0'];
  ok(sig2 && sig2.forName==='Test Architect', 'while a colleague still is');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-bothmustsign.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
