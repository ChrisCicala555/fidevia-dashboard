// Deleting a record used to remove the row and leave its documents in Box with
// nothing pointing at them. An RFI vanished from the log while its attachment
// and every supplementary document sat in the RFI folder — findable only by
// somebody browsing Box, and unexplainable once they got there. The prompt
// meanwhile said "permanently… cannot be undone", which was true of the row
// and false of the files, in the direction that matters: you could delete a
// record believing you had removed a sensitive document from the project.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const prox = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const P = bootPage();
P.run(SEED);
// A proxy that records what it was asked, so the test watches the call the
// browser really makes rather than the source that makes it.
P.run(`
  CALLS=[]; RETIRE_FAILS=false;
  proxyCall = async (op, body)=>{
    CALLS.push({op, body});
    if(op==='retireItem'){
      if(RETIRE_FAILS) throw new Error('Box 502');
      return {ok:true, moved:['RFI #RFI-GC-001'], bin:'Deleted RFIs', binId:'99'};
    }
    if(op==='list') return {entries:[]};
    return {ok:true, file:{id:'x'}};
  };
  findFile = async ()=>({id:'log1'});
  boxUploadText = async ()=>({});
  auditLog = async (...a)=>{ AUDIT=a; };
  sendEmail = (...a)=>{ MAIL=a; };
  renderAll = ()=>{};
  auth0Client = {getUser: async ()=>({email:'cc@fidevia.com', name:'Christopher'})};
`);

console.log('What a row owns in Box');
P.run(`ROW={'RFI #':'RFI-GC-001','Attachment File ID':'f1','Attachment Name':'rfi.pdf',
  'Version History':JSON.stringify([{v:1,fileId:'f1'},{v:2,fileId:'f2'},{v:3,fileId:'f3'}])}`);
{
  const ids = JSON.parse(P.run(`JSON.stringify(rowFileIds(ROW))`));
  ok(ids.join()==='f1,f2,f3',
     'every revision, not just the current one — a row revised three times points at three files');
  ok(new Set(ids).size===ids.length, 'and the attachment shared with version 1 is not listed twice');
}
ok(JSON.parse(P.run(`JSON.stringify(rowFileIds({'Signed File ID':'s1','Attachment File ID':'a1'}))`)).sort().join()==='a1,s1',
   'a signed pay application counts both the submitted and the signed copy');
ok(P.run(`rowFileIds(null).length`)===0 && P.run(`rowFileIds({'Version History':'not json'}).length`)===0,
   'and a row with nothing, or with a corrupt history, yields nothing rather than throwing');
ok(P.run(`rowFolderNumber('rfi',{'RFI #':'RFI-GC-001'})`)==='RFI-GC-001', 'an RFI is named by its number');
ok(P.run(`typeof rowItemNumber==='function' && rowItemNumber({'RFI #':'RFI-GC-001'})==='RFI-GC-001'`),
   'and the existing rowItemNumber, which answers a different question, is still itself');
ok(P.run(`rowFolderNumber('co',{'PCO #':'PCO-004','CO #':''})`)==='PCO-004',
   'a change order still at PCO stage is named by the PCO, which is what its folder is called');
ok(P.run(`rowFolderNumber('contacts',{'Name':'X'})`)==='' && P.run(`rowFolderNumber('daily',{'Date':'2026-09-01'})`)==='',
   'and modules with no item folder name nothing');

console.log('The documents move before the row goes');
P.run(`allData.rfi=[ROW]; CALLS=[];`);
await P.run(`deleteRow('rfi',0,'duplicate')`);
{
  const calls = JSON.parse(P.run(`JSON.stringify(CALLS.map(c=>c.op))`));
  ok(calls[0]==='retireItem', 'the move is the first thing that happens');
  const b = JSON.parse(P.run(`JSON.stringify(CALLS[0].body)`));
  ok(b.module==='rfi' && b.moduleFolderId==='1', 'against the module the row belongs to');
  ok(b.itemFolderName==='RFI #RFI-GC-001',
     'naming the item folder, which carries the supplementary documents with it');
  ok(JSON.stringify(b.fileIds)===JSON.stringify(['f1','f2','f3']), 'and every file the row points at');
  ok(P.run(`allData.rfi.length`)===0, 'then the row goes');
}
{
  const audit = JSON.parse(P.run(`JSON.stringify(AUDIT)`));
  ok(/moved to Deleted RFIs: RFI #RFI-GC-001/.test(audit[3]),
     'and the audit log records where the documents went, so a deletion can be traced afterwards');
  ok(/duplicate/.test(audit[3]), 'alongside the reason that was given');
}

console.log('A failed move deletes nothing');
P.run(`allData.rfi=[ROW]; CALLS=[]; RETIRE_FAILS=true; AUDIT=null;`);
let msg='';
try{ await P.run(`deleteRow('rfi',0,'oops')`); }catch(e){ msg=String(e.message||e); }
ok(msg.indexOf('Nothing was deleted')===0, 'the failure says plainly that nothing was deleted');
ok(/Box 502/.test(msg), 'and passes on what Box said, rather than a shrug');
ok(P.run(`allData.rfi.length`)===1, 'the row is still there');
ok(JSON.parse(P.run(`JSON.stringify(CALLS.map(c=>c.op))`)).indexOf('uploadText')<0,
   'and the log was never rewritten');
ok(P.run(`AUDIT===null`), 'nothing is audited as deleted, because nothing was');
ok(/\.catch\(e=>\{ alert\(/.test(html.split('function askDelete')[1]),
   'and the message reaches the screen — the click handler is not awaited, so without this it is a silent no-op');

console.log('Rows that own no documents');
P.run(`RETIRE_FAILS=false; allData.contacts=[{'Name':'Dana','Email':'d@x.test'}]; CALLS=[];`);
await P.run(`deleteRow('contacts',0,'left the firm')`);
ok(JSON.parse(P.run(`JSON.stringify(CALLS.map(c=>c.op))`)).indexOf('retireItem')<0,
   'a contact is deleted without asking Box to bin documents it never had');
ok(P.run(`allData.contacts.length`)===0, 'and the deletion still goes through');
ok(/\[no documents attached\]/.test(P.run(`String(AUDIT[3])`)),
   'the audit log saying so, rather than leaving it ambiguous');

console.log('What the person is told before it happens');
{
  const p = html.split("const why=prompt(")[1].split(");")[0];
  ok(!/permanently/.test(p) && !/cannot be undone\./.test(p),
     'the prompt no longer claims the documents are destroyed');
  ok(/"Deleted" folder in Box rather than destroyed/.test(p),
     'it says what actually happens to them');
  ok(/cannot be undone here/.test(p), 'while still being clear the row does not come back on its own');
}

console.log('The server decides where things go');
{
  const op = prox.split("if (op === 'retireItem') {")[1].split("if (op === 'ensureFolder')")[0];
  ok(/if \(!who\.isAdmin\) return json\(\{ error: 'Admins only' \}, 403\)/.test(op),
     'only Fidevia can bin a record');
  ok(/const bin = DELETED_BIN\[String\(body\.module \|\| ''\)\]/.test(op),
     'the bin name comes from a list on the server, not from whatever the browser asked for');
  ok(/if \(!await guardFolder\(modId\)\)/.test(op), 'and the module folder is one the caller may touch');
  ok(/const d = await underFolder\(H, 'files', fid, modId\);\s*\n\s*if \(!d\) continue;/.test(op),
     'a file is only moved if it already lives under that module — the ids come from a CSV, which is not a capability');
  ok(/return json\(\{ error: String\(e\.message \|\| e\) \}, 502\)/.test(op),
     'and a Box failure is reported rather than swallowed, which is what lets the browser stop');
}
{
  const mv = prox.split('async function moveInto(H, kind, id, parentId, name, stamp){')[1].split('\n}')[0];
  ok(/if \(r\.status === 409\)/.test(mv) && /\+ ' \(' \+ stamp \+ '\)'/.test(mv),
     'binning RFI-GC-001 twice does not fail on the name — the second keeps the date it was binned');
  ok(/dot > 0 \? \(name\.slice\(0, dot\) \+ ' \(' \+ stamp \+ '\)' \+ name\.slice\(dot\)\)/.test(mv),
     'and a file keeps its extension when it is renamed');
  ok(/if \(!r\.ok\) throw new Error\('Box ' \+ r\.status/.test(mv), 'any other refusal is an error, not a silent skip');
}
ok(/rfi:'Deleted RFIs'/.test(prox) && /payrolls:'Deleted Certified Payrolls'/.test(prox),
   'every module that files documents has a bin');
{
  const bins = prox.split('const DELETED_BIN = {')[1].split('};')[0];
  ok(!/contacts:/.test(bins) && !/budget:/.test(bins) && !/comments:/.test(bins),
     'and the three that file none have no bin to be asked for');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-deletebin.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
