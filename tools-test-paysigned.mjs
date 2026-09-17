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

console.log('Signing without a file is a signature all the same');
{
  const P=bootPage(); P.run(SEED);
  P.run(`allData.pay_apps=[${JSON.stringify(ROW({'Signed File ID':'signed-by-fidevia',
    'Signed File Name':'earlier.pdf','Workflow Step':'1','Status':'Awaiting Architect 2'}))}]`);
  const r=await sign(P,{ext:true, who:'Test Architect', file:null});
  ok(!r.up.some(u=>u.name), 'nothing is uploaded when nothing was chosen');
  ok(r.patch && r.patch['Signed File ID']==='signed-by-fidevia',
     'and what was already on the row survives, rather than being patched to empty');
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

console.log(bad ? `FAIL tools-test-paysigned.mjs — ${bad} of ${n}` : `ok   tools-test-paysigned.mjs — ${n} assertions`);
process.exit(bad?1:0);
