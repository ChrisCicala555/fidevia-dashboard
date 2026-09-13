// "I hit record and generate and I got an email saying the change order was
// generated. If an address is missing, then it should make you complete that
// before it generates."
//
// submitNewCo wrote the row, uploaded the log, sent "Change Order Issued" to
// everyone on the distribution, and THEN opened the generator — which refused
// for want of an address. So the record and the email said a change order
// existed when no document had been drawn, and neither can be taken back.
//
// This runs submitNewCo with a blocked owner and asserts nothing happened.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

let JSDOM;
try{ ({ JSDOM } = await import('jsdom')); }
catch(e){ console.log('SKIP tools-test-cogate.mjs — jsdom not installed (npm i)'); process.exit(0); }

const dom = new JSDOM(`<!doctype html><body>
  <select id="nc-company"><option value="Summit Builders" selected>Summit Builders</option></select>
  <input id="nc-desc" value="Additional structural bracing"><input id="nc-amount" value="7000">
  <input id="nc-num"><input id="nc-date" value="2026-09-13">
  <input type="file" id="nc-file"><p id="nc-file-hint"></p>
  <div id="nc-blocked" style="display:none"></div>
  <button id="nc-go">Record &amp; Generate</button><span id="nc-status"></span>
  </body>`);
const { window } = dom;
const grab = name => {
  let i=html.indexOf('function '+name+'(');
  if(html.slice(i-6,i)==='async ') i-=6;
  return html.slice(i, html.indexOf('\n}', i)+2);
};

const ORG_ADDR_FIELDS=[['line1','a street address'],['city','a city'],['state','a state'],['zip','a ZIP code']];
const esc=x=>String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const andList=a=>a.length<2?(a[0]||''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];

// Summit Builders is complete; the owner is the one that varies per case.
const ORGS={'summit builders':{name:'Summit Builders',line1:'123 W Church',city:'Lititz',state:'PA',zip:'17543',complete:true}};

function run(ownerName, ownerRec, opts){
  opts=opts||{};
  const did={written:0, emailed:0, audited:0, opened:0, uploaded:0};
  const orgs=Object.assign({}, ORGS);
  if(ownerRec) orgs[ownerName.toLowerCase()]=ownerRec;
  // A chosen file means no document is drawn, so the addresses do not apply.
  const fileEl=window.document.getElementById('nc-file');
  Object.defineProperty(fileEl,'files',{configurable:true, get:()=>opts.file?[{name:'signed.pdf'}]:[]});

  const src = [grab('newCoWillDraw'), grab('newCoReadiness'), grab('coDocumentReadiness'),
               grab('coReadinessHTML'), grab('newCoCompany'), grab('submitNewCo')].join('\n');
  const fn = new window.Function('document','ctx', `
    const {newCoMayIssue,newCoSet,allowRowsRead,payNum,showStatus,currentProject,MODULES,findFile,
           boxGetText,parseCSV,toCSV,boxUploadText,boxUploadBinary,itemFolderId,nextItemNumber,
           resolveMe,ME_NAME,ME_EMAIL,ME_COMPANY,allData,etToday,coSetAllowanceSplits,wfApplyDecision,
           auditLog,sendItemNotif,fmtMoney,renderAll,closeNewCo,openCoGen,orgRecordFor,orgSuggestFor,
           orgMissingBits,andList,esc,ORG_ADDR_FIELDS,closeContactDir} = ctx;
    ${src}
    return submitNewCo();
  `);
  const ctx={
    newCoMayIssue:()=>true, newCoSet:()=>[], allowRowsRead:()=>[],
    payNum:v=>parseFloat(String(v||'').replace(/[^0-9.\-]/g,''))||0,
    showStatus:()=>{}, currentProject:{name:'Ithaca', folders:{co:'1'}, config:{owner:ownerName, contractors:[{name:'Summit Builders'}]}},
    MODULES:{co:{log:'Change Order Log.csv', headers:['CO #','Description','Company','Status']}},
    findFile:async()=>null, boxGetText:async()=>'', parseCSV:()=>({rows:[]}),
    toCSV:()=>'', boxUploadText:async()=>{ did.written++; did.uploaded++; },
    boxUploadBinary:async()=>({entries:[{id:'f1'}]}), itemFolderId:async()=>'2',
    nextItemNumber:()=>'CO-001', resolveMe:async()=>{}, ME_NAME:'Christopher', ME_EMAIL:'c@fidevia.com',
    ME_COMPANY:'Fidevia', allData:{co:[]}, etToday:()=>'2026-09-13',
    coSetAllowanceSplits:()=>{}, wfApplyDecision:()=>{},
    auditLog:()=>{ did.audited++; }, sendItemNotif:()=>{ did.emailed++; },
    fmtMoney:v=>'$'+v, renderAll:()=>{}, closeNewCo:()=>{}, openCoGen:()=>{ did.opened++; },
    orgRecordFor:nm=>orgs[String(nm||'').trim().toLowerCase()]||null,
    orgSuggestFor:()=>[], orgMissingBits:r=>ORG_ADDR_FIELDS.filter(([k])=>!String((r&&r[k])||'').trim()).map(([,l])=>l),
    andList, esc, ORG_ADDR_FIELDS, closeContactDir:()=>{}
  };
  return fn(window.document, ctx).then(()=>did, e=>{ did.threw=e; return did; });
}

const OWNER_OK   = {name:'Ithaca Housing Project', line1:'953 Danby', city:'Ithaca', state:'NY', zip:'14850', complete:true};
const OWNER_HALF = {name:'Ithaca Housing Project', line1:'953 Danby', city:'', state:'', zip:'', complete:false};
const box = window.document.getElementById('nc-blocked');
const go  = window.document.getElementById('nc-go');

// ── the report: an owner with no record at all ──
let d = await run('Ithaca Admin', null);
ok(d.written===0,  'no record is written when the owner has no organization record');
ok(d.emailed===0,  'and above all nobody is emailed that a change order was issued');
ok(d.audited===0,  'nothing goes in the audit log either');
ok(d.opened===0,   'and the generator is not opened to refuse — the refusal came first');

// ── a record that exists but is half filled ──
d = await run('Ithaca Housing Project', OWNER_HALF);
ok(d.written===0 && d.emailed===0, 'a half-filled address stops it just the same');

// ── the contractor's own record ──
d = await run('Ithaca Housing Project', OWNER_OK);
ok(d.written===1 && d.emailed===1, 'with both parties complete it records and notifies as before');
// The generator opens on a short delay so the "Recorded CO-001" line is read
// before the modal swaps. Waiting it out rather than asserting into the gap.
await new Promise(r=>setTimeout(r,900));
ok(d.opened===1, 'and opens the generator, which is the whole point of Record & Generate');

// ── uploading a document written elsewhere draws nothing, so it is not gated ──
d = await run('Ithaca Admin', null, {file:true});
ok(d.written===1, 'uploading a change order written elsewhere still records');
ok(d.emailed===1, 'and notifies — no document is being drawn, so no address is needed');
ok(d.opened===0,  'and does not open the generator');

// ── it has to be visible before the button is pressed, not only after ──
{
  const fileEl=window.document.getElementById('nc-file');
  Object.defineProperty(fileEl,'files',{configurable:true, get:()=>[]});
  const mkReady=(owner,rec)=>{
    const orgs=Object.assign({}, ORGS); if(rec) orgs[owner.toLowerCase()]=rec;
    return new window.Function('document','ctx',`
      const {currentProject,orgRecordFor,orgSuggestFor,orgMissingBits,andList,esc,ORG_ADDR_FIELDS}=ctx;
      ${[grab('newCoWillDraw'),grab('newCoReadiness'),grab('coDocumentReadiness'),grab('coReadinessHTML'),grab('newCoCompany')].join('\n')}
      return newCoReadiness();
    `)(window.document,{currentProject:{config:{owner}}, orgRecordFor:nm=>orgs[String(nm||'').trim().toLowerCase()]||null,
        orgSuggestFor:()=>[], orgMissingBits:r=>ORG_ADDR_FIELDS.filter(([k])=>!String((r&&r[k])||'').trim()).map(([,l])=>l),
        andList, esc, ORG_ADDR_FIELDS});
  };
  let rd=mkReady('Ithaca Admin', null);
  ok(rd.ready===false, 'the panel reports the same verdict the button enforces');
  ok(box.style.display!=='none', 'and shows');
  ok(/cannot be drawn yet/i.test(box.innerHTML), 'saying the document is what is blocked');
  ok(/Ithaca Admin/.test(box.innerHTML), 'naming the party');
  ok(/upload a change order written elsewhere/.test(box.innerHTML), 'and the other way out of it');
  ok(go.disabled===true, 'with the button disabled, so the press is not offered at all');

  rd=mkReady('Ithaca Housing Project', OWNER_OK);
  ok(rd.ready===true && box.style.display==='none' && !box.innerHTML, 'a complete pair clears the panel');
  ok(go.disabled===false, 'and re-enables the button');

  // Choosing a file is the escape hatch, so the panel must answer to it.
  Object.defineProperty(fileEl,'files',{configurable:true, get:()=>[{name:'signed.pdf'}]});
  rd=mkReady('Ithaca Admin', null);
  ok(rd.ready===true && go.disabled===false, 'choosing a document to upload unblocks the button');
}

// ── wiring ──
ok(/if\(newCoWillDraw\(\)\)\{\s*const rd=coDocumentReadiness\(co\);/.test(html), 'the guard runs on the draw path only');
ok(html.indexOf('if(newCoWillDraw()){') < html.indexOf("const existing=await findFile(fid, MODULES.co.log);"),
   'and before the log is even read, let alone written');
{
  const f=grab('newCoFileChanged'); ok(/newCoReadiness\(\)/.test(f), 'choosing a file re-checks the panel');
  const c=grab('newCoCompanyChanged'); ok(/newCoReadiness\(\)/.test(c), 'and so does changing the contract');
  const o=grab('openNewCo'); ok(/newCoReadiness\(\)/.test(o), 'and the panel is right the moment the form opens');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-cogate.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
