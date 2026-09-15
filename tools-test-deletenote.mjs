// "I don't see the deleted RFIs" — the Deleted RFIs folder was not in Box.
//
// The bin is made only when there is something to put in it, which is right: an
// empty Deleted folder in every module of every project is clutter. But it
// means an absent folder has to be explainable from the audit log, and one of
// the three outcomes was silent. A record whose item folder was never created —
// nothing ever uploaded against it — produced no note at all, so the log could
// not say whether anything had moved.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');

// The three shapes retireRowAssets can hand back, run through the real snippet.
const src = html.slice(html.indexOf('  const where=(retired && retired.moved'), html.indexOf('\n  auditLog('));
const where = new Function('retired', src + '\nreturn where;');

console.log('Every outcome says something');
{
  const moved = where({moved:['RFI #RFI-GC-002'], bin:'Deleted RFIs'});
  ok(/moved to Deleted RFIs/.test(moved), 'documents moved: it names the bin');
  ok(/RFI #RFI-GC-002/.test(moved), 'and what went into it');
}
{
  const none = where({moved:[], nothing:true});
  ok(/no documents attached/.test(none), 'a record with nothing attached says so');
}
{
  const missing = where({moved:[]});
  ok(missing.trim()!=='', 'and a record whose folder was never created is no longer silent');
  ok(/nothing found to move/.test(missing), 'saying nothing was found');
  ok(/were ever filed against it/.test(missing), 'and why, so an absent Deleted folder is explainable');
}
{
  ok(where(null).trim()!=='', 'even a call that returned nothing leaves a note');
}
{
  // The three must be distinguishable, or the log cannot answer the question.
  const a=where({moved:['x'], bin:'Deleted RFIs'}), b=where({moved:[], nothing:true}), c=where({moved:[]});
  ok(a!==b && b!==c && a!==c, 'the three outcomes read differently');
}

console.log('The bin is still made only when it is needed');
{
  const r=srv.slice(srv.indexOf("if (op === 'retireItem')"), srv.indexOf("if (op === 'ensureFolder')"));
  ok((r.match(/binId = binId \|\| await findOrMakeChild/g)||[]).length===2,
     'created on first use, in each of the two places something can move');
  ok(!/const binId = await findOrMakeChild/.test(r),
     'and never up front, or every project would grow empty Deleted folders');
  ok(/if \(!itemName && !fileIds\.length\) return json\(\{ ok: true, moved: \[\], nothing: true \}\)/.test(r),
     'a record with nothing to move is answered without touching Box at all');
}
{
  const c=html.slice(html.indexOf('async function retireRowAssets'), html.indexOf('// Proposals a change order had absorbed'));
  ok(/if\(!num && !rowFileIds\(row\)\.length\) return \{moved:\[\], nothing:true\};/.test(c),
     'and the client does not even call for one');
}

console.log('Where the bins live');
{
  const m=srv.slice(srv.indexOf('const DELETED_BIN = {'), srv.indexOf('}', srv.indexOf('const DELETED_BIN = {'))+1);
  ok(/rfi:'Deleted RFIs'/.test(m), 'RFIs have a bin named for them');
  ok(/co:'Deleted Change Orders'/.test(m) && /sub:'Deleted Submittals'/.test(m), 'as do change orders and submittals');
  ok(/findOrMakeChild\(H, modId, bin\)/.test(srv),
     'and it is made inside the module folder, not at the project root');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-deletenote.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
