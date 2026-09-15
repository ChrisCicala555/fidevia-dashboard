// "For COs, I know there is still a Generate CO option. If we generate again, I
// feel like the previous version should be flagged as previously generated and
// Fidevia should have a chance to remove."
//
// Regenerating keeps the earlier document on purpose — it may already be out
// for signature, and deleting it would take away the thing somebody is holding.
// But it sat in the thread looking exactly like the current one, so the folder
// held two change orders for one record with nothing saying which was live.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`IS_ADMIN=true; EXTERNAL=false; ME_NAME='Christopher Cicala'; ME_EMAIL='cc@fidevia.com';`);

const GEN=(v,file,rev)=>({v, fileId:file, fileName:'CO-001'+(rev>1?(' rev'+rev):'')+'.pdf', gen:true,
  note: rev>1 ? ('Change order document regenerated — revision '+rev+'.') : 'Change order document generated.'});
const vsOf=(...a)=>a;
const call=(fn,...args)=>P.run(fn+'('+args.map(a=>JSON.stringify(a)).join(',')+')');

console.log('Which document is current');
{
  const vs=vsOf(GEN(1,'a',1), GEN(2,'b',2), GEN(3,'c',3));
  ok(call('verCurrentGen',vs).v===3, 'the newest generated one is current');
  ok(call('verSuperseded',vs,vs[0]).v===3, 'and every earlier one is superseded by it');
  ok(call('verSuperseded',vs,vs[1]).v===3, 'including the middle one');
  ok(call('verSuperseded',vs,vs[2])===null, 'the current one is superseded by nothing');
}
{
  // A reviewer's reply carrying a file is not a generated change order.
  const reply={v:2, fileId:'r', fileName:'markup.pdf', note:'Reviewed and returned'};
  const vs=vsOf(GEN(1,'a',1), reply);
  ok(call('verIsGenerated',reply)===false, 'a reply with an attachment is not a generated document');
  ok(call('verSuperseded',vs,vs[0])===null,
     'so it does not supersede the change order — only another generation does');
  ok(call('verSuperseded',vs,reply)===null, 'and it is never marked superseded itself');
}
{
  // Rows generated before the flag existed are still recognised.
  const old={v:1, fileId:'a', fileName:'CO-001.pdf', note:'Change order document generated.'};
  ok(call('verIsGenerated',old)===true, 'an older entry is recognised by what was written against it');
  ok(call('verSuperseded',vsOf(old, GEN(2,'b',2)), old).v===2, 'and can be superseded');
}
{
  ok(call('verIsGenerated',{v:1, fileName:'x.pdf', gen:true})===false,
     'an entry with no file is not a document, whatever it claims');
  ok(call('verIsGenerated',null)===false, 'and neither is nothing');
}

console.log('What the thread says');
{
  const row={'CO #':'CO-GC-001','Version History':JSON.stringify(vsOf(GEN(1,'a',1), GEN(2,'b',2)))};
  const out=P.run(`verThreadRows('co',${JSON.stringify(row)},0,10)`);
  ok(/Superseded by v2/.test(out), 'the earlier one says what replaced it');
  ok(/text-decoration:line-through/.test(out), 'and its filename is struck through');
  ok((out.match(/Superseded by/g)||[]).length===1, 'the current one is not marked — only one line is struck');
  ok(/removeVersionFile\('co',0,1\)/.test(out), 'Fidevia is offered a way to remove the superseded one');
  ok(!/removeVersionFile\('co',0,2\)/.test(out), 'and not the current one');
}
{
  P.run(`IS_ADMIN=false;`);
  const row={'CO #':'CO-GC-001','Version History':JSON.stringify(vsOf(GEN(1,'a',1), GEN(2,'b',2)))};
  const out=P.run(`verThreadRows('co',${JSON.stringify(row)},0,10)`);
  ok(/Superseded by v2/.test(out), 'a contractor still sees which document is live');
  ok(!/removeVersionFile/.test(out), 'but is offered no way to remove it');
  P.run(`IS_ADMIN=true;`);
}
{
  const gone=Object.assign(GEN(1,'',1), {removed:{by:'Christopher Cicala',at:'2026-09-16',bin:'Deleted Change Orders'}});
  const row={'CO #':'CO-GC-001','Version History':JSON.stringify(vsOf(gone, GEN(2,'b',2)))};
  const out=P.run(`verThreadRows('co',${JSON.stringify(row)},0,10)`);
  ok(/Removed by Christopher Cicala/.test(out), 'a removed one says who removed it');
  ok(/now in Deleted Change Orders/.test(out), 'and where it went, since it still exists');
  ok(!/removeVersionFile/.test(out), 'and cannot be removed twice');
  ok(!/Superseded by/.test(out), 'nor is it still nagging about being superseded');
}

console.log('Removing one');
{
  const vs=vsOf(GEN(1,'a',1), GEN(2,'b',2));
  P.run(`
    allData.co=[{'CO #':'CO-GC-001','Version History':${JSON.stringify(JSON.stringify(vs))}}];
    CALLS=[]; SAVED=null; ALERTED='';
    proxyCall=async(op,args)=>{ CALLS.push(op+':'+(args.fileIds||[]).join(',')); return {ok:true, moved:['CO-001.pdf'], bin:'Deleted Change Orders'}; };
    findFile=async()=>({id:'log'}); boxUploadText=async()=>{ CALLS.push('save'); return {}; };
    toCSV=()=>''; resolveMe=async()=>{}; renderAll=()=>{}; auditLog=(a,k,r,d)=>{ AUDIT=a+'|'+d; }; AUDIT='';
    confirm=()=>true; alert=m=>{ ALERTED=m; };
  `);
  await P.run(`removeVersionFile('co',0,1)`);
  ok(P.run(`CALLS`).join(' ')==='retireItem:a save',
     'the file is moved to the bin and the log written once — got '+P.run(`CALLS`).join(' '));
  const after=P.run(`JSON.parse(allData.co[0]['Version History'])`);
  ok(after[0].fileId==='', 'the dead link is cleared');
  ok(after[0].removed && after[0].removed.fileId==='a',
     'but the id is kept, because the file still exists in the bin');
  ok(after[0].removed.by==='Christopher Cicala', 'with who removed it');
  ok(after[0].removed.bin==='Deleted Change Orders', 'and where it went');
  ok(after[1].fileId==='b', 'the current document is untouched');
  ok(/Removed superseded document/.test(P.run(`AUDIT`)), 'and the audit log records it');
}
{
  // The current one is the change order. Removing it would leave the record
  // pointing at nothing.
  const vs=vsOf(GEN(1,'a',1), GEN(2,'b',2));
  P.run(`allData.co=[{'CO #':'CO-GC-001','Version History':${JSON.stringify(JSON.stringify(vs))}}];
         CALLS=[]; ALERTED=''; confirm=()=>true;`);
  await P.run(`removeVersionFile('co',0,2)`);
  ok(P.run(`CALLS`).length===0, 'removing the current document does nothing');
  ok(/current document/.test(P.run(`ALERTED`)), 'and says why');
}
{
  const vs=vsOf(GEN(1,'a',1), GEN(2,'b',2));
  P.run(`allData.co=[{'CO #':'CO-GC-001','Version History':${JSON.stringify(JSON.stringify(vs))}}];
         CALLS=[]; confirm=()=>false;`);
  await P.run(`removeVersionFile('co',0,1)`);
  ok(P.run(`CALLS`).length===0, 'declining the confirmation moves nothing');
}
{
  const vs=vsOf(GEN(1,'a',1), GEN(2,'b',2));
  P.run(`allData.co=[{'CO #':'CO-GC-001','Version History':${JSON.stringify(JSON.stringify(vs))}}];
         CALLS=[]; ALERTED=''; confirm=()=>true; EXTERNAL=true;`);
  await P.run(`removeVersionFile('co',0,1)`);
  ok(P.run(`CALLS`).length===0, 'a contractor reaching the handler moves nothing');
  ok(/Only Fidevia/.test(P.run(`ALERTED`)), 'and is told why');
  P.run(`EXTERNAL=false;`);
}
{
  // Box refusing must not leave the row claiming the file is gone.
  const vs=vsOf(GEN(1,'a',1), GEN(2,'b',2));
  P.run(`allData.co=[{'CO #':'CO-GC-001','Version History':${JSON.stringify(JSON.stringify(vs))}}];
         ALERTED=''; confirm=()=>true;
         proxyCall=async()=>({ok:true, moved:[]});`);
  await P.run(`removeVersionFile('co',0,1)`);
  ok(P.run(`JSON.parse(allData.co[0]['Version History'])[0].fileId`)==='a',
     'a move that did not happen leaves the version exactly as it was');
  ok(/Could not remove/.test(P.run(`ALERTED`)), 'and reports it');
}
{
  // The move succeeds and the save fails — the only path where the row has
  // already been edited, and therefore the only one where rolling back matters.
  const vs=vsOf(GEN(1,'a',1), GEN(2,'b',2));
  P.run(`allData.co=[{'CO #':'CO-GC-001','Version History':${JSON.stringify(JSON.stringify(vs))}}];
         ALERTED=''; confirm=()=>true; resolveMe=async()=>{}; renderAll=()=>{};
         proxyCall=async()=>({ok:true, moved:['CO-001.pdf'], bin:'Deleted Change Orders'});
         findFile=async()=>({id:'log'}); boxUploadText=async()=>{ throw new Error('Box said no'); };`);
  await P.run(`removeVersionFile('co',0,1)`);
  const after=P.run(`JSON.parse(allData.co[0]['Version History'])`);
  ok(after[0].fileId==='a', 'a failed save puts the version history back as it was');
  ok(!after[0].removed, 'with no removal recorded that the log does not carry');
  ok(/Box said no/.test(P.run(`ALERTED`)), 'and the failure is reported');
}

console.log('Wiring');
ok(/gen:true,/.test(html.slice(html.indexOf('async function generateChangeOrder'))),
   'a newly generated document is flagged, so the thread need not read the wording');
{
  const g=html.slice(html.indexOf('async function removeVersionFile'));
  ok(/proxyCall\('retireItem'/.test(g.slice(0,1600)),
     'removal goes through the same op a deleted record uses, so the file lands in the module bin');
  ok(/fileIds:\[String\(v\.fileId\)\]/.test(g.slice(0,1600)), 'moving that one file, not the item folder');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-supersede.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
