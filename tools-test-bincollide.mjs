// "Nothing was deleted... Box 409 moving Screenshot 2026-09-15 at 4.00.59 PM
// Dup_9.16.png. The record is still here; try again."
//
// Trying again could never have worked. Moving a document to the bin renames it
// on a name clash, but only once, and the new name carries the date — so
// deleting the same filename twice in one day collided a second time and the
// 409 was reported as a failure, for a document that was only ever going to be
// renamed.
import fs from 'fs';
import vm from 'vm';
const src=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const html=fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// Run the real thing against a bin that already holds some names.
function run(bin, name, kind='files', id='9911'){
  const taken=new Set(bin);
  const tried=[];
  const ctx={ console,
    boxFetch: async (url, opt)=>{
      const body=JSON.parse(opt.body||'{}');
      const want = body.name || name;
      tried.push(want);
      if(taken.has(want)) return { ok:false, status:409 };
      taken.add(want);
      return { ok:true, status:200, json:async()=>({}) };
    } };
  vm.createContext(ctx);
  const fns=src.slice(src.indexOf('function binName('), src.indexOf('async function folderWritableBy'));
  vm.runInContext(fns+'\nglobalThis._go=(k,i,p,nm,st)=>moveInto({},k,i,p,nm,st);', ctx);
  return ctx._go(kind, id, '7', name, '2026-09-16').then(r=>({final:r, tried}),
                                                          e=>({error:e.message, tried}));
}

console.log('The clash the user hit');
{
  const r=await run(['dup.png'], 'dup.png');
  ok(r.final==='dup (2026-09-16).png', 'one file of that name in the bin: the new one takes the date');
  ok(r.tried.join()==='dup.png,dup (2026-09-16).png', 'after trying its own name first');
}
{
  // Deleted twice in one day. This is the case that failed.
  const r=await run(['dup.png','dup (2026-09-16).png'], 'dup.png');
  ok(!r.error, 'a second delete on the same day no longer fails');
  ok(r.final==='dup (2026-09-16-2).png', 'it counts on past the date rather than giving up');
  const r3=await run(['dup.png','dup (2026-09-16).png','dup (2026-09-16-2).png'], 'dup.png');
  ok(r3.final==='dup (2026-09-16-3).png', 'and again');
}
{
  // Every dated name taken. The id cannot be, so this always terminates.
  const full=['dup.png','dup (2026-09-16).png','dup (2026-09-16-2).png',
              'dup (2026-09-16-3).png','dup (2026-09-16-4).png'];
  const r=await run(full, 'dup.png');
  ok(!r.error, 'with every dated name taken it still succeeds');
  ok(/9911/.test(String(r.final)), 'by falling back to the Box id, which no other file can hold');
}

console.log('Names are built properly');
{
  const r=await run(['a.tar.gz'], 'a.tar.gz');
  ok(r.final==='a.tar (2026-09-16).gz', 'the suffix goes before the last dot, so the file keeps its type');
  const f=await run(['RFI-GC-001'], 'RFI-GC-001', 'folders', '55');
  ok(f.final==='RFI-GC-001 (2026-09-16)', 'a folder has no extension to preserve');
  // A dot in a folder name is part of the name, not a file type.
  const f2=await run(['Set A rev.2'], 'Set A rev.2', 'folders', '56');
  ok(f2.final==='Set A rev.2 (2026-09-16)',
     'so a folder called "rev.2" is not renamed to "Set A rev (2026-09-16).2"');
  const d=await run(['.gitignore'], '.gitignore');
  ok(d.final==='.gitignore (2026-09-16)',
     'a name that is all extension is not cut in half — there is no stem to put the date after');
}

console.log('A real failure is still a failure');
{
  const ctx={ console, boxFetch: async ()=>({ ok:false, status:403 }) };
  vm.createContext(ctx);
  vm.runInContext(src.slice(src.indexOf('function binName('), src.indexOf('async function folderWritableBy'))
    +'\nglobalThis._go=()=>moveInto({},"files","1","7","x.png","2026-09-16");', ctx);
  let msg=''; try{ await ctx._go(); }catch(e){ msg=e.message; }
  ok(/Box 403 moving x\.png/.test(msg), 'a refusal is reported, not retried under another name');
}
{
  const r=await run([], 'clean.png');
  ok(r.final==='clean.png' && r.tried.length===1,
     'and a name nobody has taken is moved once, under the name it already had');
}

console.log('What the code says');
{
  const f=src.slice(src.indexOf('async function moveInto('), src.indexOf('async function folderWritableBy'));
  ok(/const suffixes = \[stamp, stamp \+ '-2'/.test(f), 'more than one suffix is tried');
  ok(/stamp \+ ' \\u00b7 ' \+ id\]/.test(f), 'and the last one carries the id');
  ok(/if \(r\.status !== 409\) throw/.test(f) && (f.match(/if \(r\.status !== 409\) throw/g)||[]).length===2,
     'anything that is not a name clash stops it, on the first attempt and on the retries');
  ok(/the bin already holds every name tried/.test(f),
     'and if it somehow ran out, it says what it ran out of');
}
ok(/Nothing was deleted\. The documents could not be moved to /.test(html),
   'the dashboard still refuses the delete when the move genuinely fails');
ok(/The record is still here; try again\./.test(html),
   'leaving the record where it is rather than orphaning its files');

console.log((bad?'FAIL':'ok  ')+' tools-test-bincollide.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
