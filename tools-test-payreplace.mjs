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
  // Only two writes to the status in the whole function: the one the review
  // asked for, and putting it back when the save fails.
  ok((sub.match(/r\['Status'\]=/g)||[]).length===2,
     'the status is untouched, except where the review asked for a correction');
  ok(/r\['Status'\]=\(String\(r\['Copy Type'\]\|\|''\)\.trim\(\)\|\|'Uploaded'\)\+' \\u2014 awaiting Fidevia'/.test(sub),
     'and then it goes back to awaiting Fidevia, rather than still reading "revise and resubmit"');
  ok(/_patch\['Status'\]=r\['Status'\]/.test(sub), 'which is sent with the rest');
  ok(/r\['Workflow Status'\]='In Review';\s*\n\s*_patch\['Workflow Status'\]=r\['Workflow Status'\];/.test(sub),
     'and the chain wakes on the step of whoever sent it back, so it lands in front of them again');
  ok(/r\['Status'\]=b\.s; r\['Workflow Status'\]=b\.w;/.test(sub), 'and both are put back if the save fails');
  ok(!/r\['Copy Type'\]=/.test(sub), 'and so is pencil-or-final, the number and the period');
  ok(!/r\['App #'\]=/.test(sub) && !/r\['Period'\]=/.test(sub),
     'this is the same application correctly documented, not a new one');
  ok(/vs\.push\(\{v:vs\.length\+1/.test(sub), 'the old document stays as a version');
  ok(/Replaced by the contractor before review/.test(sub), 'saying plainly what happened');
  ok(/was '\+old/.test(sub), 'and naming what it replaced, so the history reads without opening the files');
  ok(/auditLog\('Document replaced before review'/.test(sub), 'it reaches the audit log');
  ok(/payNotify\(r, /.test(sub) && /document replaced/.test(sub),
     'and Fidevia is told, because they may be part-way through reading the old one');
  ok(!/notifyContacts\(/.test(sub),
     'through the rule that keeps one contractor\u2019s money out of another\u2019s inbox, not the shared toggle list');
  ok(/const b=JSON\.parse\(before\);[\s\S]*r\['Attachment File ID'\]=b\.a/.test(sub),
     'a failed upload puts the row back rather than leaving it pointing at nothing');
  ok(/await payAppFolder\(r\)/.test(sub), 'and the new file lands in that application’s own folder');
}

console.log('Through the path a contractor is allowed to write on');
{
  const P2=bootPage(); P2.run(SEED);
  P2.run(`
    EXTERNAL=true; IS_ADMIN=false;
    viewingAsExternal=function(){ return true; };
    viewingAsCompany=function(){ return 'Summit Builders'; };
    allData.pay_apps=[{'App #':'PA #01','Contractor':'Summit Builders','Company':'Summit Builders',
      'Copy Type':'Final','Status':'Uploaded — awaiting Fidevia','Attachment File ID':'a',
      'Attachment Name':'wrong-month.pdf','Version History':JSON.stringify([{v:1,fileId:'a',fileName:'wrong-month.pdf'}])}];
    CALLS=[]; PATCH=null; KEY=''; PAYREPL_IDX=0;
    document.getElementById('payrepl-file').files=[{name:'september.pdf'}];
    boxUploadBinary=async()=>({entries:[{id:'b'}]}); payAppFolder=async()=>'99';
    findFile=async()=>({id:'log'});
    boxUploadText=async()=>{ CALLS.push('WHOLE FILE'); return {}; };
    boxUpdateRow=async(k,row,patch)=>{ CALLS.push('save'); KEY=k; PATCH=patch; return {}; };
    toCSV=()=>''; resolveMe=async()=>{}; renderAll=()=>{}; auditLog=()=>{ CALLS.push('audit'); };
    payNotify=()=>{ CALLS.push('told'); }; notifyContacts=()=>{ CALLS.push('EVERYBODY'); };
    emailTemplate=()=>''; showStatus=()=>{};
  `);
  await P2.run(`submitPayReplace()`);
  const row=P2.run(`allData.pay_apps[0]`);
  ok(row['Attachment File ID']==='b' && row['Attachment Name']==='september.pdf',
     'the row points at the corrected document');
  ok(JSON.parse(row['Version History']).length===2, 'and the wrong one stays in the history');
  // Rewriting the whole log is Fidevia's alone: this ran as the contractor and
  // came back "Access denied" after the file had already uploaded — the
  // document in Box, the row never moved.
  ok(!P2.run(`CALLS`).includes('WHOLE FILE'), 'not by rewriting the whole log, which a contractor may not do');
  ok(P2.run(`KEY`)==='pay_apps' && P2.run(`CALLS`).join()==='save,audit,told', 'but by patching the one row');
  ok(Object.keys(P2.run(`PATCH`)).sort().join()==='Attachment File ID,Attachment Name,Version History',
     'sending only the three fields that changed');
}
ok(/if\(key==='pay_apps'\) match\['Contractor'\]=row\['Contractor'\]\|\|row\['Company'\]\|\|'';/.test(html),
   'and naming the contractor as well as the number, since both companies have a PA #01');

console.log('Where the contractor finds it');
{
  ok(/payMayReplace\(r\)\?\('<button class="row-act"[\s\S]{0,260}openPayReplace\('\+idx\+'\)">'\+\(payWasReturned\(r\)\?'Submit revision':'Replace file'\)/.test(html),
     'a button on their own row, which says Submit revision when that is what it is');
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
