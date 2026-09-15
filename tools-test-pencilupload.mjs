// "Contractor, when they hit upload new payment, there should be a slider
// between pencil copy or final copy."
//
// And the two are one record: the final replaces the pencil on the same row, so
// the markup the architect put on the pencil stays attached to the thing being
// paid on, and one period keeps one application number.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

console.log('The choice is on the form');
{
  const f=html.slice(html.indexOf("payapp_ext:{title:'Upload Payment Application'"), html.indexOf("cdaily:{title:"));
  ok(/id="f-copytype"/.test(f), 'the upload form asks which copy this is');
  ok(/data-v="Pencil"/.test(f) && /data-v="Final"/.test(f), 'with both options');
  ok(/data-v="Pencil"[^>]*aria-checked="true"/.test(f), 'pencil selected to begin with');
  ok(/role="radiogroup"/.test(f) && (f.match(/role="radio"/g)||[]).length===2,
     'announced as a choice of two rather than as two buttons');
  ok(/id="f-copytype-note"/.test(f), 'and a line saying what the choice means');
}

let JSDOM;
try{ ({ JSDOM } = await import('jsdom')); }
catch(e){ console.log('  (skipping the DOM half — jsdom not installed)'); }
if(JSDOM){
  const { window } = new JSDOM('<!doctype html><body></body>');
  const grab = name => { let i=html.indexOf('function '+name+'('); return html.slice(i, html.indexOf('\n}', i)+2); };
  const api = new window.Function('document',
    [grab('segPick'),grab('segValue'),grab('segSet'),grab('copyTypeNote')].join('\n')
    +'\nreturn {segPick,segValue,segSet,copyTypeNote};')(window.document);
  const form=html.slice(html.indexOf('<div class="seg" id="f-copytype"'), html.indexOf('id="f-copytype-note"'));
  window.document.body.innerHTML=form+'<p id="f-copytype-note"></p></div>';

  console.log('Picking one');
  ok(api.segValue('f-copytype')==='Pencil', 'it starts on pencil');
  const opts=[...window.document.querySelectorAll('.seg-opt')];
  api.segPick(opts[1]);
  ok(api.segValue('f-copytype')==='Final', 'pressing the other selects it');
  ok(opts[1].className.indexOf('on')>=0 && opts[0].className.indexOf('on')<0, 'only one is on at a time');
  ok(opts[1].getAttribute('aria-checked')==='true' && opts[0].getAttribute('aria-checked')==='false',
     'and the announcement follows the highlight');
  api.segSet('f-copytype','Pencil');
  ok(api.segValue('f-copytype')==='Pencil', 'it can be set by value');
  api.segSet('f-copytype','Final');
  api.segSet('f-copytype','nonsense');
  ok(api.segValue('f-copytype')==='Pencil',
     'and a value it does not know falls back to the first rather than leaving the last answer standing');

  console.log('The note explains the difference');
  api.segSet('f-copytype','Pencil'); api.copyTypeNote();
  const pencilNote=window.document.getElementById('f-copytype-note').textContent;
  ok(/owner does not see it/.test(pencilNote), 'a pencil says the owner cannot see it');
  api.segSet('f-copytype','Final'); api.copyTypeNote();
  const finalNote=window.document.getElementById('f-copytype-note').textContent;
  ok(/owner sees it/.test(finalNote), 'and a final says they can — the reason the distinction exists');
  ok(pencilNote!==finalNote, 'the two say different things');
}

console.log('What the upload records');
{
  const u=html.slice(html.indexOf("} else if(currentModal==='payapp_ext'){"), html.indexOf("} else if(currentModal==='cdaily'){"));
  ok(/const _copy = segValue\('f-copytype'\)==='Final' \? 'Final' : 'Pencil';/.test(u),
     'the choice is read from the form, defaulting to pencil rather than to whatever is missing');
  ok(/'Copy Type':_copy/.test(u), 'and written to the row');
  ok(/_copy==='Pencil'\?'Pencil . awaiting Fidevia'/.test(u), 'a pencil says so in its status');
  ok(/status:_copy/.test(u), 'and the first version entry records which it was');
}
ok(/if\(type==='payapp_ext'\)\{[\s\S]{0,300}segSet\('f-copytype','Pencil'\)/.test(html),
   'the form resets to pencil each time it opens, rather than keeping the last answer');

console.log('Promoting a pencil to the final');
{
  const P=bootPage(); P.run(SEED);
  P.run(`
    EXTERNAL=true; IS_ADMIN=false; DATA_READY=true;
    currentProject.userCompany='Summit Builders'; currentProject.userRole='contractor';
    allData.pay_apps=[
      {'App #':'PA-001','Contractor':'Summit Builders','Company':'Summit Builders','Copy Type':'Pencil',
       'Status':'Pencil — awaiting Fidevia','Attachment File ID':'a','Attachment Name':'pencil.pdf',
       'Version History':JSON.stringify([{v:1,fileId:'a',fileName:'pencil.pdf',status:'Pencil'}])},
      {'App #':'PA-002','Contractor':'Delaney Mechanical','Company':'Delaney Mechanical','Copy Type':'Pencil',
       'Status':'Pencil — awaiting Fidevia'},
      {'App #':'PA-003','Contractor':'Summit Builders','Company':'Summit Builders','Copy Type':'Final',
       'Status':'Uploaded — awaiting Fidevia'}];
  `);
  ok(P.run(`payMayPromote(allData.pay_apps[0])`)===true, 'a contractor may finalise their own pencil');
  ok(P.run(`payMayPromote(allData.pay_apps[1])`)===false, "but not another firm's");
  ok(P.run(`payMayPromote(allData.pay_apps[2])`)===false, 'and not one that is already final');
  P.run(`EXTERNAL=false; document.body.classList.remove('external-mode');`);
  ok(P.run(`payMayPromote(allData.pay_apps[0])`)===false,
     'Fidevia does not submit a contractor’s final application for them — that is signing their name to a figure');
  P.run(`EXTERNAL=true;`);
  ok(P.run(`payIsPencil(allData.pay_apps[0])`)===true && P.run(`payIsPencil(allData.pay_apps[2])`)===false,
     'and a pencil is recognised by its column');
  ok(P.run(`payIsPencil({})`)===false, 'a row with no copy type is not a pencil');
}
{
  const P=bootPage(); P.run(SEED);
  P.run(`
    EXTERNAL=true; IS_ADMIN=false;
    currentProject.userCompany='Summit Builders'; currentProject.userRole='contractor';
    allData.pay_apps=[{'App #':'PA-001','Contractor':'Summit Builders','Company':'Summit Builders',
      'Copy Type':'Pencil','Status':'Pencil — awaiting Fidevia','Attachment File ID':'a',
      'Attachment Name':'pencil.pdf','Version History':JSON.stringify([{v:1,fileId:'a',fileName:'pencil.pdf',status:'Pencil'}])}];
    CALLS=[]; PAYFINAL_IDX=0;
    document.getElementById('payfinal-file').files=[{name:'final.pdf'}];
    boxUploadBinary=async()=>({entries:[{id:'b'}]}); itemFolderId=async()=>'99';
    findFile=async()=>({id:'log'}); boxUploadText=async()=>{ CALLS.push('save'); return {}; };
    toCSV=()=>''; resolveMe=async()=>{}; renderAll=()=>{}; auditLog=()=>{ CALLS.push('audit'); };
    showStatus=()=>{};
  `);
  await P.run(`submitPayFinal()`);
  const r=()=>P.run(`allData.pay_apps[0]`);
  ok(r()['Copy Type']==='Final', 'submitting the final flips the row');
  ok(r()['Attachment File ID']==='b', 'the final becomes the current document');
  ok(/awaiting Fidevia/.test(r()['Status']) && !/Pencil/.test(r()['Status']), 'and the status stops saying pencil');
  const vs=JSON.parse(r()['Version History']);
  ok(vs.length===2, 'the pencil stays in the history rather than being overwritten');
  ok(vs[0].fileId==='a' && vs[0].status==='Pencil', 'with its own file still reachable');
  ok(vs[1].status==='Final' && vs[1].fileId==='b', 'and the final recorded above it');
  ok(P.run(`CALLS`).join()==='save,audit', 'written once and recorded');
  ok(P.run(`allData.pay_apps[0]['App #']`)==='PA-001', 'the application keeps its number — one period, one number');
}
{
  // A failed upload must not leave the row claiming to be final.
  const P=bootPage(); P.run(SEED);
  P.run(`
    EXTERNAL=true; IS_ADMIN=false;
    currentProject.userCompany='Summit Builders'; currentProject.userRole='contractor';
    allData.pay_apps=[{'App #':'PA-001','Contractor':'Summit Builders','Company':'Summit Builders',
      'Copy Type':'Pencil','Status':'Pencil — awaiting Fidevia','Attachment File ID':'a',
      'Attachment Name':'pencil.pdf','Version History':'[]'}];
    PAYFINAL_IDX=0; document.getElementById('payfinal-file').files=[{name:'final.pdf'}];
    boxUploadBinary=async()=>({entries:[{id:'b'}]}); itemFolderId=async()=>'99';
    findFile=async()=>({id:'log'}); boxUploadText=async()=>{ throw new Error('Box said no'); };
    toCSV=()=>''; resolveMe=async()=>{}; renderAll=()=>{}; showStatus=(i,t,k)=>{ SAID=t; }; SAID='';
  `);
  await P.run(`submitPayFinal()`);
  ok(P.run(`allData.pay_apps[0]['Copy Type']`)==='Pencil', 'a failed save leaves it a pencil');
  ok(P.run(`allData.pay_apps[0]['Attachment File ID']`)==='a', 'with its original document');
  ok(/Box said no/.test(P.run(`SAID`)), 'and the failure is reported');
}

console.log('The log says which it is');
{
  ok(/payIsPencil\(r\) \? '<div class="cell-sub"[^>]*>Pencil copy<\/div>/.test(html),
     'a pencil row is labelled on the log, under its number');
  ok(/payMayPromote\(r\)\?'<button class="btn-approve" onclick="openPayFinal\('\+idx\+'\)">Submit Final/.test(html),
     'and carries the contractor’s own Submit Final button');
  ok(/<td class="pay-act">/.test(html) && /<th class="pay-act">Action<\/th>/.test(html),
     'in a column that is no longer admin-only, or the contractor would never see it');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-pencilupload.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
