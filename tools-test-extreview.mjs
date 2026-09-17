// "I am the architect — how can I review this?"
//
// They could not. Take Action was Fidevia's alone, so a design reviewer sitting
// on a pencil copy step had no way to answer it and the chain stopped there
// until Fidevia signed on their behalf as an override.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const srv=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const P=bootPage(); P.run(SEED);
const FID={name:'Fidevia Review', person:'Christopher Cicala', company:'Fidevia', email:'chris@fidevia.com'};
const ARCH={name:'Architect Review', person:'Test Architect', company:'Architect 2', email:'arch@example.com'};
P.run(`
  EXTERNAL=true; IS_ADMIN=false;
  ME_NAME='Test Architect'; ME_EMAIL='arch@example.com';
  viewingAsExternal=function(){ return true; };
  viewingAsCompany=function(){ return ''; };
  viewerFirm=function(){ return 'Architect 2'; };
  currentProject={name:'X',folders:{pay_apps:'9'},config:{contractors:[{name:'Summit Builders'}]}};
  wfEffectiveSteps=function(){ return [${JSON.stringify(FID)},${JSON.stringify(ARCH)}]; };
`);
const ROW=(o)=>Object.assign({'App #':'PA #01','Contractor':'Summit Builders','Company':'Summit Builders',
  'Copy Type':'Pencil','Status':'Pencil — awaiting Fidevia','Workflow Step':'1',
  'Workflow Status':'In Review','Workflow Done':'','Workflow Signed':'{"0":{"by":"Christopher Cicala"}}',
  'Archived':''}, o);
const may=(o)=>P.run(`payMayReview(${JSON.stringify(ROW(o))})`);

console.log('The step is theirs, so the button is');
{
  ok(may()===true, 'the architect may record the step the chain has reached');
  ok(may({'Workflow Step':'0'})===false, 'but not one that belongs to Fidevia');
  P.run(`ME_EMAIL='someone@else.com'; ME_NAME='Someone Else';`);
  ok(may()===true, 'a colleague at the named firm may, since the obligation is the office’s');
  P.run(`viewerFirm=function(){ return 'Engineer 1'; };`);
  ok(may()===false, 'somebody at another firm may not');
  // A step labelled "Architect 2" and a grant issued to the firm's real name
  // are the same office. Matching only what the step says shut the architect
  // out of their own step.
  P.run(`allData.contacts=[{'Name':'Test Architect','Company':'Clymer LLC','Email':'clymer@example.com'}];
         viewerFirm=function(){ return 'Clymer LLC'; };
         ME_NAME='Someone Else'; ME_EMAIL='someone@else.com';`);
  ok(may()===true,
     'the firm the contact sheet gives the person on the step counts as much as the label on it');
  P.run(`allData.contacts=[]; viewerFirm=function(){ return 'Nobody Ltd'; };`);
  ok(may()===false, 'and a firm that is neither still may not');
  // Only the label on the step matches: a different person, a different
  // address, and nothing on the contact sheet to resolve the name through.
  P.run(`viewerFirm=function(){ return 'Architect 2'; };`);
  ok(may()===true, 'the label on the step is enough on its own');
  // Somebody with no firm recorded must not fall through a blank comparison
  // into every step whose person is not on the contact sheet.
  P.run(`viewerFirm=function(){ return ''; };`);
  ok(may()===false, 'and a viewer with no firm at all matches nothing');
  P.run(`viewerFirm=function(){ return 'Architect 2'; };
         ME_NAME='Test Architect'; ME_EMAIL='arch@example.com';`);
  P.run(`viewingAsCompany=function(){ return 'Architect 2'; };
         ME_EMAIL='arch@example.com'; ME_NAME='Test Architect';`);
}
{
  ok(may({'Workflow Signed':'{"0":{"by":"C"},"1":{"by":"Test Architect"}}'})===false,
     'a step they have already answered is not theirs to answer twice');
  ok(may({'Workflow Done':'[1]'})===false, 'nor one already marked done in a part-signed group');
  ok(may({'Workflow Status':'Rejected'})===false, 'a closed chain has nothing to record');
  ok(may({'Workflow Status':''})===false, 'nor a chain that is not running');
  ok(may({'Status':'Revise and resubmit — awaiting contractor'})===false,
     'and one sent back is with the contractor, not with the reviewer who sent it');
  ok(may({'Archived':'Yes'})===false, 'an archived application is out of the active record');
}
{
  // The party being paid does not rule on their own application.
  P.run(`viewerFirm=function(){ return 'Summit Builders'; };`);
  ok(may()===false, 'a contractor never reviews, whatever the chain says');
  P.run(`viewerFirm=function(){ return 'Architect 2'; };`);
}
{
  P.run(`wfEffectiveSteps=function(){ throw new Error('no config'); };`);
  ok(may()===false, 'a chain that cannot be read grants nothing');
  P.run(`wfEffectiveSteps=function(){ return []; };`);
  ok(may()===false, 'and a project with no chain configured grants nothing either');
  P.run(`wfEffectiveSteps=function(){ return [${JSON.stringify(FID)},${JSON.stringify(ARCH)}]; };`);
}
ok(/payMayReview\(r\)\?'<button class="btn-approve" onclick="openPayAction\('\+idx\+'\)">Review<\/button>'/.test(html),
   'and the row carries a Review button for them');

{
  // The bug itself. viewingAsCompany is empty for a design role on purpose:
  // an architect reviews every contractor, so their rows are scoped to none.
  // Asking it "which office am I?" got '' back and shut them out of their own
  // step. viewerFirm answers the question that was actually being asked.
  const v=html.split('function viewerFirm(){')[1].split('\n}')[0];
  ok(/if\(EXTERNAL\) return String\(\(currentProject&&currentProject\.userCompany\)\|\|''\)\.trim\(\);/.test(v),
     'a real external reader is their own firm, whatever their role');
  ok(/external-mode'\)\) return String\(VIEWER_COMPANY\|\|''\)\.trim\(\);/.test(v),
     'and Fidevia previewing as somebody is that somebody');
  ok(/return '';/.test(v), 'while Fidevia reading as itself belongs to no outside firm');
  const r=html.split('function payMayReview(row){')[1].split('\n}')[0];
  ok(/const myCo=String\(viewerFirm\(\)\|\|''\)\.trim\(\)\.toLowerCase\(\);/.test(r),
     'and the review test asks viewerFirm, not the row-scoping one');
  ok(!/viewingAsCompany/.test(r), 'nowhere in it asks the scoping question');
  ok(/payContractorOf\(\{'Company':viewerFirm\(\)\}\)/.test(r),
     'including the check that keeps a contractor out of reviewing');
}

console.log('When it says no, it says why');
{
  // Three things can line up and none of them did. Without this there is no
  // button and no way to tell which of the three was wrong.
  P.run(`LOGGED=''; console.debug=function(m){ LOGGED=String(m); };
    ME_NAME='Clymer'; ME_EMAIL='clymerllc@gmail.com';
    viewerFirm=function(){ return 'Clymer LLC'; };
    allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'arch@example.com'}];`);
  ok(may()===false, 'a reader who matches none of the three does not get the button');
  const line=String(P.run(`LOGGED`));
  ok(/no match on PA #01/.test(line), 'and the console names the application');
  ok(/email:"clymerllc@gmail\.com"/.test(line) && /firm:"clymer llc"/.test(line),
     'what the reader arrived with');
  ok(/"person":"Test Architect"/.test(line) && /"company":"Architect 2"/.test(line),
     'and what the step asked for');
  ok(/"firmOfPerson":"Architect 2"/.test(line),
     'including the firm the contact sheet gives that person, which is the other way it could have matched');
  P.run(`LOGGED=''; viewerFirm=function(){ return 'Architect 2'; };`);
  ok(may()===true && String(P.run(`LOGGED`))==='',
     'and a match says nothing at all \u2014 the trace is for the failure');
  P.run(`ME_NAME='Test Architect'; ME_EMAIL='arch@example.com'; allData.contacts=[];`);
}

console.log('What they see, and what they do not');
{
  const o=html.split('function openPayAction(idx){')[1].split('\nfunction payActionChanged')[0];
  ok(/box\.style\.display=\(needs && !_ext\)\?'':'none';/.test(o),
     'the contractor’s figures are Fidevia’s to record, and are not offered to a reviewer');
  ok(/if\(af\) af\.style\.display = \(pencil \|\| _ext\) \? 'none' : '';/.test(o),
     'nor is the approved payment amount');
  ok(/viewingAsExternal\(\) \? 'Record your review — '/.test(o),
     'and the dialog says what it is for');
}

console.log('What they may write, and where');
{
  const sub=html.split('async function submitPayAction(){')[1].split('\nfunction updateContractBar')[0];
  ok(/if\(_ext && !payMayReview\(row\)\) throw new Error\('This step is not yours to record\.'\);/.test(sub),
     'the rule is checked again at the moment of writing');
  ok(/if\(_ext\)\{\s*\n\s*await boxUpdateRow\('pay_apps', row, \{/.test(sub),
     'a reviewer patches the row rather than rewriting the log, which is Fidevia’s alone');
  ok(/\} else \{\s*\n\s*await boxUploadText\(mod\.log/.test(sub), 'Fidevia still rewrites it');
  ok(/if\(_ext\)\{ rows=allData\.pay_apps\|\|\[\]; \}/.test(sub),
     'and works from the rows the page holds rather than re-reading a log they may not read whole');
  const patch=sub.split("await boxUpdateRow('pay_apps', row, {")[1].split('});')[0];
  ['Status','Action','Reviewed By','Review Date','Version History',
   'Workflow Step','Workflow Status','Workflow Done','Workflow Signed'].forEach(k=>
    ok(patch.includes("'"+k+"'"), k+' is part of what a review writes'));
  ok(!/Approved Amount/.test(patch), 'and the money is not — that is Fidevia’s');
  ok(!/Requested Amount|Contract Amount|Previously Paid|App #|Contractor/.test(patch),
     'nor anything the contractor stated');
}

console.log('And the server agrees');
{
  const ur=srv.slice(srv.indexOf("if (op === 'updateRow')"), srv.indexOf("if (op === 'appendRow')"));
  ok(/const payReviewer = filename === PAY_LOG && seesAllCompanies\(role\);/.test(ur),
     'a design role on a payment application is a reviewer');
  ok(/if \(payReviewer\) \{ ALLOWED\.add\('Reviewed By'\); ALLOWED\.add\('Review Date'\); ALLOWED\.add\('Action'\); \}/.test(ur),
     'who may write the outcome of a review');
  ok(/if \(!payReviewer && payRowReviewed\(row\)/.test(ur),
     'and is not turned away by the marks Fidevia’s own review left — which is every review after the first');
  ok(/if \(!payReviewer && 'Status' in patch && !PAY_AWAITING/.test(ur),
     'they may record an approval, where the contractor may not');
  ok(/if \(payReviewer && 'Copy Type' in patch\) return json/.test(ur),
     'but promoting a pencil to a final is the contractor’s act, not theirs');
  const allowed=ur.slice(ur.indexOf('const ALLOWED'), ur.indexOf("'Assigned To']"));
  ['Approved Amount','Requested Amount','Contract Amount','Previously Paid','App #','Contractor']
    .forEach(f=>ok(!allowed.includes("'"+f+"'"), f+' is writable by nobody from outside'));
  ok(/if \(!seesAllCompanies\(role\)\)/.test(ur), 'and a contractor is still held to their own rows');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-extreview.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
