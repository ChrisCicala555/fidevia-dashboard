// "Make sure we are uploading file here — same with when architect signs."
//
// Two signatures on one application: Fidevia's, then the architect's. Fidevia
// rewrites the log; the architect may only patch their own row, and the patch
// is a named list of fields. Leave the signed file off that list and the PDF
// reaches Box while the row goes on pointing at the contractor's unsigned
// original — uploaded, and lost. This walks both signatures for real.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');

const ROW=(o)=>Object.assign({'App #':'PA-001','Contractor':'Summit Builders','Company':'Summit Builders',
  'Copy Type':'Final','Status':'Uploaded — awaiting Fidevia','Requested Amount':'100000',
  'Attachment File ID':'orig','Attachment Name':'PA-001.pdf','Signed File ID':'','Signed File Name':'',
  'Workflow Step':'0','Workflow Status':'','Workflow Done':'','Workflow Signed':''}, o);

// The dialog, filled in and submitted, with Box stubbed at the edge.
async function sign(P, {ext, who, file, action}){
  P.run(`
    UPLOADED=[]; CALLS=[]; PATCH=null; SAVED_ROWS=null;
    payAppFolder=async function(r){ UPLOADED.push({folderFor:(r&&r['App #'])||''}); return 'payfolder'; };
    boxUploadBinary=async function(f, parent){ UPLOADED.push({name:f.name, parent:parent});
      return {entries:[{id:'signed-'+f.name}]}; };
    findFile=async function(){ return {id:'log'}; };
    boxGetText=async function(){ return ''; };
    parseCSV=function(){ return {rows:(allData.pay_apps||[])}; };
    toCSV=function(h,rows){ SAVED_ROWS=rows; return 'csv'; };
    boxUploadText=async function(){ CALLS.push('WHOLE FILE'); return {}; };
    boxUpdateRow=async function(k,row,patch){ CALLS.push('patch'); PATCH=patch; return {}; };
    auth0Client={ getUser:async()=>({name:${JSON.stringify(who)}}) };
    resolveMe=async function(){}; renderAll=function(){}; auditLog=function(){};
    payNotify=function(){}; notifyContacts=function(){}; emailTemplate=function(){ return ''; };
    showStatus=function(){}; alert=function(m){ CALLS.push('ALERT: '+m); };
    EXTERNAL=${ext?'true':'false'}; IS_ADMIN=${ext?'false':'true'};
    viewingAsExternal=function(){ return ${ext?'true':'false'}; };
    payMayReview=function(){ return true; };
    PAY_CTX={idx:0};
    document.getElementById('pa-details').style.display='none';
    var sel=document.getElementById('pa-action');
    sel.innerHTML=payActions(allData.pay_apps[0]).map(function(a){return '<option>'+a[0]+'</option>';}).join('');
    sel.value=${JSON.stringify(action||'Approve and Sign')};
    payActionChanged();
    document.getElementById('pa-note').value='Looks right';
    document.getElementById('pa-file').files=${file?`[{name:${JSON.stringify(file)}}]`:'[]'};
  `);
  await P.run(`submitPayAction()`);
  // Nothing throws out of submitPayAction: a failure is written into the
  // progress line and the function returns. Read it, or a save that never
  // happened looks like a pass.
  return { row:P.run(`allData.pay_apps[0]`), up:P.run(`UPLOADED`),
           calls:P.run(`CALLS`), patch:P.run(`PATCH`), saved:P.run(`SAVED_ROWS`),
           err:P.run(`(document.getElementById('pa-progress')||{}).textContent||''`) };
}

console.log('Fidevia signs first');
{
  const P=bootPage(); P.run(SEED);
  P.run(`allData.pay_apps=[${JSON.stringify(ROW())}]`);
  const r=await sign(P,{ext:false, who:'Christopher Cicala', file:'PA-001 signed by Fidevia.pdf'});
  ok(!/^Error/.test(r.err), 'the save goes through — '+r.err);
  ok(r.up.some(u=>u.name==='PA-001 signed by Fidevia.pdf'), 'the chosen file is actually uploaded');
  ok(r.up.some(u=>u.parent==='payfolder'), 'into the folder this application keeps its papers in');
  ok(r.row['Signed File ID']==='signed-PA-001 signed by Fidevia.pdf',
     'and the row points at it — the whole purpose of choosing it');
  ok(r.row['Signed File Name']==='PA-001 signed by Fidevia.pdf', 'by name as well as by id');
  ok(r.row['Attachment File ID']==='orig',
     'while the contractor’s original stays where it is, since a signature is not a replacement');
  ok(JSON.parse(r.row['Version History']||'[]').some(v=>v.fileId==='signed-PA-001 signed by Fidevia.pdf'),
     'and the history records which file the signature was on');
  ok(r.calls.includes('WHOLE FILE'), 'Fidevia rewrites the log, which is theirs to rewrite');
}

console.log('Then the architect signs, from outside');
{
  const P=bootPage(); P.run(SEED);
  // Where the row stands after Fidevia: step 1 signed, waiting on the architect.
  P.run(`allData.pay_apps=[${JSON.stringify(ROW({
    'Status':'Awaiting Architect 2','Workflow Step':'1',
    'Signed File ID':'signed-by-fidevia','Signed File Name':'PA-001 signed by Fidevia.pdf'}))}]`);
  const r=await sign(P,{ext:true, who:'Test Architect', file:'PA-001 signed by architect.pdf'});
  ok(!/^Error/.test(r.err), 'the save goes through — '+r.err);
  ok(r.up.some(u=>u.name==='PA-001 signed by architect.pdf'), 'their file is uploaded too');
  ok(!r.calls.includes('WHOLE FILE'), 'not by rewriting the log, which they may not');
  ok(r.patch && r.patch['Signed File ID']==='signed-PA-001 signed by architect.pdf',
     'and the patch carries the file — left off, the PDF reaches Box and the row never points at it');
  ok(r.patch && r.patch['Signed File Name']==='PA-001 signed by architect.pdf', 'with its name');
  ok(r.row['Signed File ID']==='signed-PA-001 signed by architect.pdf',
     'the countersigned copy supersedes Fidevia’s, being the same paper with one more signature on it');
  ok(JSON.parse(r.row['Version History']||'[]').some(v=>v.fileId==='signed-by-fidevia')
     || JSON.parse(r.row['Version History']||'[]').length>=2,
     'and the earlier one is still reachable through the history');
}

console.log('A signature nobody can produce is not a signature')
{
  const P=bootPage(); P.run(SEED);
  // The row already carries Fidevia's signed copy. That is not the architect's
  // signature, so it does not stand in for one.
  P.run(`allData.pay_apps=[${JSON.stringify(ROW({'Signed File ID':'signed-by-fidevia',
    'Signed File Name':'PA-001 signed by Fidevia.pdf','Workflow Step':'1','Status':'Awaiting Architect 2'}))}]`);
  const r=await sign(P,{ext:true, who:'Test Architect', file:null});
  ok(/^Error/.test(r.err), 'signing with nothing attached is refused');
  ok(/Attach the signed application/.test(r.err), 'and says what is missing \u2014 '+r.err);
  ok(!r.calls.includes('patch') && !r.calls.includes('WHOLE FILE'),
     'nothing is saved, so the row does not read Approved & Signed over unsigned paper');
  ok(r.row['Status']==='Awaiting Architect 2', 'and the application is still theirs to sign');
}

console.log('A denial signs nothing, so it needs no paper');
{
  const P=bootPage(); P.run(SEED);
  P.run(`allData.pay_apps=[${JSON.stringify(ROW())}]`);
  const r=await sign(P,{ext:false, who:'Christopher Cicala', file:null, action:'Deny'});
  ok(!/^Error/.test(r.err), 'a denial goes through without one \u2014 '+r.err);
  ok(r.calls.includes('WHOLE FILE'), 'and is saved');
}

console.log('And the form says so before you get there')
{
  const o=html.split('function openPayAction(idx){')[1].split('\nconst PAY_MODIFY')[0];
  ok(/'Upload signed payment application \*'/.test(o),
     'the formal application asks for the file with a star, like every other required field');
  ok(/pencil \? 'Upload marked-up pencil copy'/.test(o),
     'while a pencil copy still asks for a mark-up, which is optional');
  ok(/Required to sign\./.test(o), 'and the hint under it says as much');
  ok(/PAY_SIGNS=\/sign\/i;/.test(html),
     'what counts as signing is the word in the action, so a new signing outcome is covered by default');
  // And what keeps a draft out of the rule is that none of its outcomes is a
  // signature — not a second test of the copy type next to the first one.
  const P=bootPage(); P.run(SEED);
  ok(!P.run(`payActions({'Copy Type':'Pencil'}).map(function(a){return a[0];})`).some(a=>/sign/i.test(a)),
     'a pencil copy offers no outcome that signs, so no mark-up is ever demanded');
}

console.log('A marked-up pencil copy is a version, not a signature');
{
  const P=bootPage(); P.run(SEED);
  P.run(`allData.pay_apps=[${JSON.stringify(ROW({'Copy Type':'Pencil',
    'Status':'Pencil — awaiting Fidevia'}))}]`);
  const r=await sign(P,{ext:false, who:'Christopher Cicala', file:'marked up.pdf', action:'Approved as Noted'});
  ok(r.up.some(u=>u.name==='marked up.pdf'), 'the file still uploads');
  ok(r.row['Attachment File ID']==='signed-marked up.pdf',
     'but lands on the document itself, because nobody signs a draft');
  ok(!String(r.row['Signed File ID']||''), 'and the signed slot stays empty');
}

console.log('The button says which of the two it is')
{
  const P=bootPage(); P.run(SEED);
  const lab=(row, ext)=>P.run(`(function(){ viewingAsExternal=function(){ return ${ext?'true':'false'}; };
    return payActionLabel(${JSON.stringify(row)}); })()`);
  const FINAL={'App #':'PA-001','Copy Type':'Final','Requested Amount':'100000'};
  const PENCIL={'App #':'PA-001','Copy Type':'Pencil','Requested Amount':'100000'};
  ok(lab(FINAL,true)==='Sign Final',
     'the architect is signing the formal application, and the button says so rather than "Review"');
  ok(lab(FINAL,false)==='Sign Final', 'and so is Fidevia, at their own step on the same document');
  ok(lab(PENCIL,true)==='Review pencil', 'a draft is reviewed, which is a different act');
  ok(lab(PENCIL,false)==='Review pencil', 'for either of them');
  // Fidevia opening a row the contractor filed with no figures on it does two
  // jobs at once, and the button has always said both.
  const BARE={'App #':'','Copy Type':'Final','Requested Amount':''};
  ok(lab(BARE,false)==='Record & Sign', 'reading the figures off the paper and signing it is still one click');
  ok(lab(Object.assign({},BARE,{'Copy Type':'Pencil'}),false)==='Record & Review', 'or one review');
  ok(lab(BARE,true)==='Sign Final',
     'but never for somebody outside Fidevia, who is not shown the figures to record');

  // "PA-1 — I already signed that jawn." It said Sign Final on a row reading
  // Approved & Signed, which is an invitation to sign it twice.
  const DONE=Object.assign({}, FINAL, {'Status':'Approved & Signed','Workflow Status':'Complete'});
  ok(lab(DONE,false)==='Amend', 'a settled row offers a correction, not a second signature');
  ok(lab(Object.assign({},FINAL,{'Status':'Approved & Signed'}),false)==='Amend',
     'read off the status too, since a row decided without a chain behind it is just as settled');
  ok(lab(Object.assign({},PENCIL,{'Status':'Pencil approved \u2014 awaiting final'}),false)==='Amend',
     'and an approved pencil is done with Fidevia \u2014 the next move is the contractor\u2019s');
  ok(lab(Object.assign({},PENCIL,{'Status':'Revise and resubmit \u2014 awaiting contractor'}),false)==='Amend',
     'as is one sent back');
  ok(lab(Object.assign({},FINAL,{'Status':'Uploaded \u2014 awaiting Fidevia'}),false)==='Sign Final',
     'while one still waiting on them says so \u2014 "awaiting" is not a decision');
  ok(lab(Object.assign({},PENCIL,{'Status':'Pencil \u2014 with Architect 2'}),false)==='Review pencil',
     'nor is a chain mid-flight, whoever is holding it');

  const row=html.split('function renderPayApps(')[1].split('\nfunction togglePayGroup')[0];
  ok(/'<button class="'\+\(paySettled\(r\)\?'row-act':'btn-approve'\)\+'"/.test(row),
     'and it is drawn as a quiet secondary rather than the green one that asks to be pressed');
  ok((row.match(/esc\(payActionLabel\(r\)\)/g)||[]).length===2,
     'one label serves both the inside button and the outside one, so they cannot drift apart');
  ok(!/>Take Action</.test(row) && !/Record &amp; Review'/.test(row),
     'and neither carries a fixed word any more');
  const o=html.split('function openPayAction(idx){')[1].split('\nconst PAY_MODIFY')[0];
  ok(/payActionLabel\(r\)\+' \u2014 '/.test(o),
     'the dialog it opens is headed the same, so the click and what it opens agree');
}

console.log(bad ? `FAIL tools-test-paysigned.mjs — ${bad} of ${n}` : `ok   tools-test-paysigned.mjs — ${n} assertions`);
process.exit(bad?1:0);
