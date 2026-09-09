// A reviewer should press one button once. There were two that looked alike
// and behaved differently, chosen by whether the chain was sitting on the
// reader at the moment the row was drawn — so an architect could write a
// review, watch nothing move, and find the other button waiting for them.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
b.run(`allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
  {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test'},
  {'Name':'Gorilla PM','Company':'Gorilla Construction','Email':'g@g.test'}];
currentProject.config.workflows.sub=[{name:'Architect Review',person:'Test Architect',email:'a@x.test'},
  {name:'Engineer Review',person:'Penelope Odiem',email:'p@y.test'}];
allData.sub=[{'Submittal #':'SUB-GO-001','Description':'Wall','Submitted By (Sub)':'g@g.test (Gorilla Construction)',
  'Company':'Gorilla Construction','Reviewer':'Architect 2','Status':'Pending Review',
  'Workflow Step':'0','Workflow Status':'In Review','Version History':'[]'}];`);
const look=(email,co,role,ext,adm)=>{
  b.run(`EXTERNAL=${ext};IS_ADMIN=${adm};ME_EMAIL='${email}';ME_NAME='';ME_COMPANY='${co}';
    currentProject.userCompany='${co}';currentProject.userRole='${role}';DATA_READY=true;`);
  const m=b.run("verThreadRows('sub',allData.sub[0],0,10)").match(/openReply\('sub',0,(true|false)\)">([^<]+)</);
  return m ? {advances:m[1]==='true', text:m[2].replace(/&amp;/g,'&').replace(/&rarr;/g,'->')} : null;
};

console.log('The reviewer’s one press');
{
  const a=look('a@x.test','Architect 2','architect',true,false);
  ok(a.advances && /Review & Continue/.test(a.text),
     'the architect whose step is current gets the advancing action');
  const later=look('p@y.test','Next Level Engineers','engineer',true,false);
  ok(later.advances, 'and so does one named later in the chain, so their press is not wasted');
  ok(/Submit Review Step/.test(later.text), 'labelled for what they are doing');
}
// Recording a review early is safe: applyReviewAdvance signs the reader's own
// steps within the current group and nobody else's, so a step that is not yet
// current signs nothing.
{
  b.run(`ME_EMAIL='p@y.test'; currentProject.userRole='engineer'; currentProject.userCompany='Next Level Engineers';
    allData.sub[0]['Workflow Step']='0'; allData.sub[0]['Workflow Signed']='';
    openReply('sub',0,true); document.getElementById('reply-action').value='continue';
    document.getElementById('reply-status').value='Approved';
    applyReviewAdvance('sub', allData.sub[0], 'Penelope Odiem');`);
  ok(b.run("JSON.stringify(wfSignedMap(allData.sub[0]))")==='{}',
     'a reviewer acting before their turn signs nothing');
  ok(b.run("allData.sub[0]['Workflow Step']")==='0', 'and the chain does not move');
}

console.log('Who is not handed it');
{
  const fid=look('cc@fidevia.com','Fidevia','',false,true);
  ok(!fid.advances,
     'Fidevia’s ordinary reply does not advance — applyReviewAdvance would sign the architect’s step as an override');
  ok(/Reply \/ New Version/.test(fid.text), 'it is a reply, and says so');
  const other=look('other@z.test','Draper','architect',true,false);
  ok(!other.advances, 'an architect who is not on this chain records a reply, not a review');
  const gc=look('g@g.test','Gorilla Construction','contractor',true,false);
  ok(!gc.advances && /Submit Updated Version/.test(gc.text),
     'and the contractor who filed it posts a version');
}
ok(/const _rvOnChain = _rvSteps\.length>0 && _rvSteps\.some\(wfStepIsMine\);/.test(html),
   'the test is being named in the chain, not holding an administrator account');
ok(!/_rvDecides/.test(html), 'the earlier version, which did hand it to every administrator, is gone');

console.log('Knowing who the reader is, before anything is drawn');
{
  // Every "is this mine" on the page runs off ME_EMAIL. A first paint before
  // it arrives answers all of them with no, then corrects itself — which reads
  // as the dashboard changing its mind about whose review it is.
  // A step is matched on its firm too now, which cushions this: an architect
  // whose company is known is still recognised with no address loaded. Not
  // everything is — a step naming somebody at a firm the reader is not at, and
  // any check that runs off ME_EMAIL alone, still answers no.
  const firmOnly=look('','Architect 2','architect',true,false);
  ok(firmOnly.advances, 'the firm match survives an address that has not arrived');
  const blank=look('','','architect',true,false);
  ok(!blank.advances,
     'but with neither address nor company the architect is not recognised — which is why identity is loaded first');
  const c = html.split('async function openProject')[1].split('\nasync function ')[0];
  ok(/try\{ await resolveMe\(\); \}catch\(e\)\{\}\s*\n\s*\/\/ loadDashboard lifts the gate/.test(c),
     'so the project waits for it before the first render');
  ok(c.indexOf('await resolveMe()') < c.indexOf('await loadDashboard()'),
     'and does so before, not after');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-onereview.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
