// The dialog a contractor gets when a submittal comes back to them.
//
// It was the reviewer's dialog: titled "Review", asking "What are you doing?"
// with three answers that are all a reviewer's — record my review, add somebody
// to the review, hand my review to somebody else. None of them is what the
// contractor is doing. They are sending the revision back.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
b.run(`allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
  {'Name':'Test Contractor','Company':'Summit Builders','Email':'gc@s.test'}];
currentProject.config.workflows.sub=[{name:'Architect Review',person:'Test Architect',email:'a@x.test'}];
allData.sub=[{'Submittal #':'SUB-GC-002','Description':'Bigger panels',
  'Submitted By (Sub)':'gc@s.test (Summit Builders)','Company':'Summit Builders','Reviewer':'Architect 2',
  'Status':'Resubmitted','Workflow Step':'1','Workflow Status':'In Review','Version History':'[]',
  'Workflow Extra':JSON.stringify([{after:0,name:'Revise and Resubmit',person:'Test Contractor',
    company:'Summit Builders',email:'gc@s.test',returned:true}])}];`);
const open=(email,co,role,ext,adm,adv)=>{
  b.run(`EXTERNAL=${ext};IS_ADMIN=${adm};ME_EMAIL='${email}';ME_COMPANY='${co}';
    currentProject.userCompany='${co}';currentProject.userRole='${role}';DATA_READY=true;
    openReply('sub',0,${adv});`);
  return { title: b.run("document.getElementById('reply-title').textContent"),
           asks:  b.run("document.getElementById('reply-next-field').style.display")!=='none',
           status:b.run("document.getElementById('reply-status-field').style.display")!=='none',
           file:  b.run("document.getElementById('reply-file-label').textContent"),
           action:b.run("document.getElementById('reply-action').value") };
};

console.log('The contractor sending a revision back');
{
  const v=open('gc@s.test','Summit Builders','contractor',true,false,true);
  ok(/^Submit Revision — SUB-GC-002$/.test(v.title),
     'the dialog says what they are doing ('+v.title+')');
  ok(!v.asks, 'and does not ask which kind of review this is — none of the answers were theirs');
  ok(!v.status, 'nor for a decision, which is the reviewer’s to make');
  ok(/Revised document/.test(v.file),
     'and asks for the document rather than offering an upload in passing');
  ok(v.action==='continue',
     'the answer they were never asked is the one that simply moves the chain along');
}

console.log('The reviewers still get their dialog');
{
  // On the returned step the item is with the contractor, so the architect is
  // a reviewer with nothing to review here. Put the chain back on them to ask
  // the question this assertion is actually about.
  b.run("allData.sub[0]['Workflow Step']='0';");
  const a=open('a@x.test','Architect 2','architect',true,false,true);
  ok(/^Review — /.test(a.title), 'the architect is reviewing');
  ok(a.asks, 'and is asked what kind of review — the three answers are all theirs');
  b.run("allData.sub[0]['Workflow Step']='1';");
  const f=open('cc@fidevia.com','Fidevia','',false,true,true);
  ok(f.asks && f.status, 'Fidevia keeps both the question and the decision');
}

console.log('An ordinary reply is still an ordinary reply');
{
  const v=open('gc@s.test','Summit Builders','contractor',true,false,false);
  ok(/^Reply — /.test(v.title), 'not advancing means replying, whoever is reading');
  ok(!v.asks, 'with nothing asked about reviews');
  ok(/Upload new version \(optional\)/.test(v.file), 'and the upload stays optional');
}

console.log('The rule');
{
  const c = html.split('function openReply')[1].split('\n// Why this item is settled')[0];
  ok(/const _reviews = !EXTERNAL \|\| DESIGN_ROLES\.includes\(viewingAsRole\(\)\);/.test(c),
     'who reviews decides whether the question is asked');
  ok(/const _sendingBack = advance && !_reviews;/.test(c),
     'and somebody advancing who does not review is sending a revision back');
  ok(/nf\.style\.display = \(advance && _decides\) \? '' : 'none';/.test(c),
     'so the reviewer’s question is hidden from them');
  ok(/if\(act && !_decides\) act\.value='continue';/.test(c),
     'left on continue rather than on whatever it held last time');
  // Being a reviewer is not enough: an architect whose item has gone back to
  // the contractor is a reviewer with nothing to review here.
  const v=open('a@x.test','Architect 2','architect',true,false,true);
  ok(!v.asks, 'a reviewer looking at somebody else’s step is not asked either');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-resubdialog.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
