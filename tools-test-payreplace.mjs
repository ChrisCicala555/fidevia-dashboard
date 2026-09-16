// "If Fidevia has not reviewed yet, I think we should give the option for
// contractors to upload an updated version."
//
// Before this there was no way back: the row was filed and only Fidevia could
// touch it. What people do instead is file a second application — two live rows
// for one billing period, and a number somebody has to retire by hand.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`EXTERNAL=true; IS_ADMIN=false;
  viewingAsExternal=function(){ return true; };
  viewingAsCompany=function(){ return 'Summit Builders'; };`);
const R=(o)=>Object.assign({'App #':'PA #01','Contractor':'Summit Builders','Company':'Summit Builders',
  'Copy Type':'Final','Period':'2026-09-01','Status':'Uploaded — awaiting Fidevia',
  'Attachment File ID':'f1','Attachment Name':'PA01.pdf','Reviewed By':'','Review Date':'',
  'Action':'','Signed File ID':'','Signed File Name':'','Approved Amount':'',
  'Workflow Done':'','Archived':''}, o);
const may=(o)=>P.run(`payMayReplace(${JSON.stringify(R(o))})`);

console.log('While nothing has been done with it');
{
  ok(may()===true, 'an application still waiting on Fidevia can be corrected');
  ok(may({'Status':'Submitted'})===true, 'however the waiting is worded');
  ok(may({'Status':'Pencil — awaiting Fidevia','Copy Type':'Pencil'})===true, 'including a pencil copy');
}

console.log('Once somebody has reviewed it, the document they read stays put');
{
  ok(may({'Status':'Approved & Signed'})===false, 'an approved application is fixed');
  ok(may({'Status':'Denied'})===false, 'and so is a denied one — the refusal was of that document');
  ok(may({'Reviewed By':'Chris Cicala'})===false, 'a recorded reviewer closes it');
  ok(may({'Review Date':'2026-09-14'})===false, 'so does a review date');
  ok(may({'Action':'Approve and Sign'})===false, 'so does a recorded action');
  ok(may({'Signed File ID':'f9'})===false, 'so does a signed copy — Fidevia put their name to a document');
  ok(may({'Signed File Name':'PA01-signed.pdf'})===false, 'named but not yet carrying an id, the same');
  // An approved amount never stands alone: whatever writes it writes the
  // status with it, and that status is caught above. A guard of its own here
  // would be a line no review could reach.
  ok(may({'Status':'Approved & Signed','Approved Amount':'50000'})===false,
     'an approved amount comes with the status that catches it');
  ok(may({'Approved Amount':'50000'})===true,
     'and on its own, with nothing else to show for a review, it does not lock a row nobody has read');
  ok(may({'Workflow Done':'[0]'})===false, 'and so does a completed step on the review chain');
  ok(may({'Workflow Done':'[]'})===true, 'an empty chain is not a completed one');
  ok(may({'Workflow Done':'not json'})===true, 'and unreadable history does not lock a row nobody reviewed');
}

console.log('And only the contractor whose application it is');
{
  ok(may({'Contractor':'Delaney Mechanical','Company':'Delaney Mechanical'})===false,
     "another company's application is not theirs to change");
  ok(may({'Contractor':'','Company':'Summit Builders'})===true, 'the company field answers when the contractor one is blank');
  ok(may({'Archived':'Yes'})===false, 'an archived application is out of the active record');
  ok(may({'Attachment File ID':''})===false,
     'and a row with nothing filed has nothing to replace — that one needs Fidevia to record it');
  P.run(`viewingAsExternal=function(){ return false; };`);
  ok(may()===false, 'Fidevia does not replace a document on the contractor’s behalf; they have Take Action');
  P.run(`viewingAsExternal=function(){ return true; };
         viewingAsCompany=function(){ return ''; };`);
  ok(may()===false, 'and an external reader with no company of their own gets nothing');
  P.run(`viewingAsCompany=function(){ return 'Summit Builders'; };`);
}

console.log('What replacing does, and what it leaves alone');
{
  const sub=html.split('async function submitPayReplace(){')[1].split('\nfunction payStatusColor')[0];
  ok(/if\(!r \|\| !payMayReplace\(r\)\)\{ closePayReplace\(\); renderAll\(\); return; \}/.test(sub),
     'the rule is checked again at the moment of writing, not only when the dialog opened');
  ok(/Choose the corrected document\./.test(sub), 'a replacement with no file is refused');
  ok(/r\['Attachment File ID'\]=ent\.id/.test(sub) && /r\['Attachment Name'\]=f\.files\[0\]\.name/.test(sub),
     'the row points at the new document');
  ok(!/r\['Status'\]=/.test(sub), 'the status is untouched — it is still waiting on Fidevia');
  ok(!/r\['Copy Type'\]=/.test(sub), 'and so is pencil-or-final, the number and the period');
  ok(!/r\['App #'\]=/.test(sub) && !/r\['Period'\]=/.test(sub),
     'this is the same application correctly documented, not a new one');
  ok(/vs\.push\(\{v:vs\.length\+1/.test(sub), 'the old document stays as a version');
  ok(/Replaced by the contractor before review/.test(sub), 'saying plainly what happened');
  ok(/was '\+old/.test(sub), 'and naming what it replaced, so the history reads without opening the files');
  ok(/auditLog\('Document replaced before review'/.test(sub), 'it reaches the audit log');
  ok(/notifyContacts\(/.test(sub) && /document replaced/.test(sub),
     'and Fidevia is told, because they may be part-way through reading the old one');
  ok(/const b=JSON\.parse\(before\);[\s\S]*r\['Attachment File ID'\]=b\.a/.test(sub),
     'a failed upload puts the row back rather than leaving it pointing at nothing');
  ok(/await payAppFolder\(r\)/.test(sub), 'and the new file lands in that application’s own folder');
}

console.log('Where the contractor finds it');
{
  ok(/payMayReplace\(r\)\?'<button class="row-act"[^']*openPayReplace\('\+idx\+'\)">Replace file<\/button>'/.test(html),
     'a button on their own row');
  const ext=html.split(":((payMayPromote(r)")[1].split(';')[0];
  ok(/Submit Final/.test(ext) && /Replace file/.test(ext),
     'alongside Submit Final, since a pencil copy can be both wrong and ready to finalise');
  ok(/id="payrepl-backdrop"/.test(html) && /id="payrepl-file"/.test(html), 'and a dialog to do it in');
  ok(/backdropClick\(event,closePayReplace\)/.test(html),
     'which closes on the backdrop the same way as every other, drag-select included');
}
{
  const o=html.split('function openPayReplace(idx){')[1].split('\nfunction closePayReplace')[0];
  ok(/alert\('That application has already been reviewed/.test(o),
     'opening it on a reviewed row says why rather than failing quietly');
  ok(/Fidevia has not reviewed this yet/.test(o), 'and the dialog says why it is allowed');
  ok(/keeps its number and its period/.test(o), 'and what it will not disturb');
}
ok(/function closePayReplace\(\)\{[^}]*PAYREPL_IDX=-1;/.test(html),
   'closing forgets which row it was, so a later replace cannot land on it');

console.log((bad?'FAIL':'ok  ')+' tools-test-payreplace.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
