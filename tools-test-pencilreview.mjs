// "Does this make sense on the pencil copy?" — pointing at Upload Signed
// Payment Application, sitting under an Approved Payment Amount, under a
// dropdown offering Approve and Sign.
//
// No. A pencil copy is a draft. Nobody signs one and no payment is approved off
// one: the review says whether the contractor may go ahead and file the formal
// application, and on what terms. The outcomes are the submittal's, which is
// what this review actually is.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
const R=(o)=>Object.assign({'App #':'PA #01','Contractor':'Summit Builders','Company':'Summit Builders',
  'Copy Type':'Pencil','Status':'Pencil — awaiting Fidevia','Requested Amount':'50000',
  'Approved Amount':'','Attachment File ID':'a','Attachment Name':'pencil.pdf'}, o);
const F=(o)=>R(Object.assign({'Copy Type':'Final','Status':'Uploaded — awaiting Fidevia'},o));

console.log('Two different reviews, because they are two different questions');
{
  const pencil=P.run(`payActions(${JSON.stringify(R())}).map(function(a){return a[0];})`);
  ok(pencil.join()==='Approved,Approved as Noted,Revise and Resubmit,Rejected',
     'a pencil copy gets the submittal outcomes, which is what this review is');
  ok(!pencil.some(a=>/sign/i.test(a)), 'and nothing about signing, because nobody signs a draft');
  const final=P.run(`payActions(${JSON.stringify(F())}).map(function(a){return a[0];})`);
  ok(final.join()==='Approve and Sign,Modify and Sign,Deny', 'the formal application keeps its own');
  ok(P.run(`payStatusFor(${JSON.stringify(R())},'Approved')`)==='Pencil approved \u2014 awaiting final',
     'approving a pencil says what happens next, rather than reading as paid');
  ok(P.run(`payStatusFor(${JSON.stringify(R())},'Revise and Resubmit')`)
       ==='Revise and resubmit \u2014 awaiting contractor', 'and a return says whose move it is');
  ok(P.run(`payStatusFor(${JSON.stringify(F())},'Approve and Sign')`)==='Approved & Signed',
     'the formal outcomes are unchanged');
  ok(P.run(`payStatusFor(${JSON.stringify(F())},'Something Else')`)==='Something Else',
     'an outcome from neither list is passed through rather than silently becoming one of them');
}

console.log('An approved pencil copy is not money');
{
  // payApproved falls back to the requested figure when the status says
  // approved and no amount was recorded — which is every approved pencil.
  ok(P.run(`payApproved(${JSON.stringify(R({'Status':'Pencil approved — awaiting final'}))})`)===0,
     'an approved pencil bills nothing');
  ok(P.run(`payApproved(${JSON.stringify(R({'Status':'Pencil approved — awaiting final','Approved Amount':'50000'}))})`)===0,
     'even carrying an amount from somewhere, because a pencil is a draft');
  ok(P.run(`payApproved(${JSON.stringify(F({'Status':'Approved & Signed'}))})`)===50000,
     'while an approved formal application bills what was requested');
  ok(/function payApproved\(r\)\{ if\(payIsPencil\(r\)\) return 0;/.test(html),
     'which is one check at the top, not a condition threaded through the sums that use it');
}

console.log('What the dialog shows');
{
  const o=html.split('function openPayAction(idx){')[1].split('\nfunction payActionChanged')[0];
  ok(/const pencil=payIsPencil\(r\);/.test(o), 'it knows which it is');
  ok(/sel\.innerHTML=payActions\(r\)\.map/.test(o), 'the outcomes come from the row');
  ok(/if\(af\) af\.style\.display = \(pencil \|\| _ext\) \? 'none' : '';/.test(o),
     'the approved payment amount is not shown at all on a pencil \u2014 there is no payment to approve \u2014 '
     +'nor to a reviewer from outside, for whom the money was never theirs to set');
  ok(/set\('pa-file-label', pencil \? 'Upload marked-up pencil copy' : 'Upload signed payment application'\)/.test(o),
     'and the upload asks for a marked-up copy rather than a signed one');
  ok(/nothing is signed and no payment is approved here/.test(o), 'saying so in a line above the choices');
  ok(/set\('pa-action-label', pencil \? 'Review outcome' : 'Action'\)/.test(o), 'and calls it a review');
  ok(/id="pa-amount-field"/.test(html) && /id="pa-file-label"/.test(html) && /id="pa-kind-note"/.test(html),
     'all of which the markup gives it somewhere to say');
  ok(/const nt=document\.getElementById\('pa-note'\); if\(nt\) nt\.value='';/.test(o),
     'and the comments start empty rather than carrying the last review\u2019s');
}
ok(/id="pa-note" rows="3"/.test(html), 'there is somewhere to write the comments');

console.log('A review the contractor cannot act on is refused');
{
  ok(P.run(`PAY_NOTE_REQUIRED.test('Approved as Noted')`)===true, 'approved as noted needs the notes');
  ok(P.run(`PAY_NOTE_REQUIRED.test('Revise and Resubmit')`)===true, 'so does a return');
  ok(P.run(`PAY_NOTE_REQUIRED.test('Rejected')`)===true, 'and a refusal');
  ok(P.run(`PAY_NOTE_REQUIRED.test('Deny')`)===true, 'in either wording');
  ok(P.run(`PAY_NOTE_REQUIRED.test('Approved')`)===false, 'a plain approval needs nothing said');
  ok(P.run(`PAY_NOTE_REQUIRED.test('Approve and Sign')`)===false, 'nor a signature');
  const sub=html.split('async function submitPayAction(){')[1].split('\nfunction updateContractBar')[0];
  ok(/if\(PAY_NOTE_REQUIRED\.test\(action\) && !note\)\s*\n\s*throw new Error/.test(sub),
     'and the save refuses one without them');
}

console.log('What the review writes');
{
  const sub=html.split('async function submitPayAction(){')[1].split('\nfunction updateContractBar')[0];
  ok(/const appAmt = \(pencil \|\| _ext\) \? 0\s*\n\s*: \(action==='Deny' \? 0 : \(_modify \? amount : payReqNow\(\)\)\);/.test(sub),
     'a pencil approves nothing to be paid — nor does a review recorded from outside Fidevia');
  ok(/row\['Approved Amount'\]= \(pencil \|\| _ext\) \? \(row\['Approved Amount'\]\|\|''\) : String\(appAmt\);/.test(sub),
     'and leaves the amount as it was rather than writing a zero over what Fidevia recorded');
  ok(/if\(pencil\)\{ if\(sfid\)\{ row\['Attachment File ID'\]=sfid; row\['Attachment Name'\]=sname; \} \}/.test(sub),
     'a marked-up pencil is another version of the document, not a signed counterpart of it');
  ok(/else \{ row\['Signed File ID'\]=sfid; row\['Signed File Name'\]=sname; \}/.test(sub),
     'which the formal application still has');
  ok(/note:action\+\(pencil\?'':\(' · '\+fmtMoney\(appAmt\)\)\)\+\(note\?\(' — '\+note\):''\)/.test(sub),
     'the history records the outcome and the comments, and a figure only where there is one');
  ok(/\(pencil\?'Pencil Copy ':'Payment Application '\)/.test(sub),
     'the email calls it what it is');
  ok(/\.concat\(\(pencil\|\|_pending\)\?\[\]:\[\['Approved Amount',fmtMoney\(appAmt\)\]\]\)/.test(sub),
     'and does not quote an approved amount that was never approved \u2014 nor one that is not settled yet');
  ok(/\['Comments',note\|\|'\\u2014'\]/.test(sub), 'but does carry the comments, which are the point of the review');
}

console.log('And what the contractor can do afterwards');
{
  P.run(`EXTERNAL=true; IS_ADMIN=false;
    viewingAsExternal=function(){ return true; };
    viewingAsCompany=function(){ return 'Summit Builders'; };`);
  const may=(o)=>P.run(`payMayReplace(${JSON.stringify(R(o))})`);
  const promote=(o)=>P.run(`payMayPromote(${JSON.stringify(R(o))})`);
  const sent=R({'Status':'Revise and resubmit — awaiting contractor','Reviewed By':'Chris Cicala',
                'Review Date':'2026-09-16','Action':'Revise and Resubmit'});
  ok(P.run(`payMayReplace(${JSON.stringify(sent)})`)===true,
     'a pencil sent back can be re-filed — being told to revise with no way to file the revision is not a workflow');
  ok(P.run(`payMayPromote(${JSON.stringify(sent)})`)===false,
     'but not skipped straight to the formal application; the corrected pencil comes first');
  const refused=R({'Status':'Pencil rejected','Reviewed By':'Chris Cicala','Action':'Rejected'});
  ok(P.run(`payMayPromote(${JSON.stringify(refused)})`)===false,
     'and a refused pencil is not one to build a formal application on');
  ok(P.run(`payMayReplace(${JSON.stringify(refused)})`)===false,
     'nor is it re-filed by replacing the document \u2014 a refusal is not a request for another draft');
  const approved=R({'Status':'Pencil approved — awaiting final','Reviewed By':'Chris Cicala','Action':'Approved'});
  ok(promote({'Status':'Pencil approved — awaiting final'})===true, 'an approved pencil goes on to the final');
  ok(P.run(`payMayReplace(${JSON.stringify(approved)})`)===false,
     'and its document stands, because somebody reviewed that document');
  ok(may()===true, 'an untouched pencil can still simply be corrected');
}
{
  ok(/Submit revision/.test(html), 'the row says Submit revision when that is what it is');
  const o=html.split('function openPayReplace(idx){')[1].split('\nfunction closePayReplace')[0];
  ok(/This was sent back to be revised\. Filing the corrected document puts it back with Fidevia\./.test(o),
     'and the dialog says what filing it does');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-pencilreview.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
