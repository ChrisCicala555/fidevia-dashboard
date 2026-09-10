// Writing to a log that has moved underneath you.
//
// Everything located the row it was about to write with rows[i] — the index the
// page was rendered with. A page left open while somebody deleted a submittal
// did not fail: it wrote to whatever row had slid into that position. A reply
// meant for a deleted item landed on a different item, and the notification
// went out naming the wrong one.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const mk=id=>({'Submittal #':id,'Description':'d','Submitted By (Sub)':'gc@s.test (Summit Builders)',
  'Company':'Summit Builders','Status':'Pending Review','Workflow Step':'0',
  'Workflow Status':'In Review','Version History':'[]'});
b.run(`allData.sub=${JSON.stringify(['SUB-GC-001','SUB-GC-002','SUB-GC-003'].map(mk))};`);
const LOG_NOW = JSON.stringify([{'Submittal #':'SUB-GC-002'},{'Submittal #':'SUB-GC-003'}]);

console.log('Finding a row by what it is');
b.run("openReply('sub',0,false)");
ok(b.run("REPLY_CTX.id")==='SUB-GC-001',
   'the dialog records which item it was opened about, when it is opened');
ok(b.run(`(${LOG_NOW})[0]['Submittal #']`)==='SUB-GC-002',
   'and index 0 in the current log is a different submittal — the whole problem in one line');
ok(b.run(`rowIndexById('sub', ${LOG_NOW}, REPLY_CTX.id)`)===-1, 'so the deleted one is reported gone');
b.run("openReply('sub',1,false)");
ok(b.run(`rowIndexById('sub', ${LOG_NOW}, REPLY_CTX.id)`)===0,
   'while one that merely moved is found at its new position and written to correctly');
ok(b.run(`rowIndexById('sub', ${LOG_NOW}, 'sub-gc-003')`)===1, 'matching ignores case and spacing');
ok(b.run(`rowIndexById('sub', ${LOG_NOW}, '')`)===-1, 'and an empty identifier matches nothing');
ok(b.run(`rowIndexById('daily', ${LOG_NOW}, 'SUB-GC-002')`)===-1,
   'a module with no identifier column cannot be matched by one');

console.log('What it says');
{
  const m=b.run("rowGoneError('sub','SUB-GC-001').message");
  ok(/SUB-GC-001/.test(m), 'the message names the item rather than saying "not found"');
  ok(/deleted or renumbered/.test(m), 'says what probably happened');
  ok(/Nothing has been saved/.test(m), 'and that nothing was written, which is the part worth knowing');
}

console.log('Both write paths use it');
{
  const c = html.split('async function submitReply')[1].split('\n// Completing a review')[0];
  // The call gained a position argument used only to break a tie between rows
  // that share a number; the lookup is still by identifier.
  ok(/const _n=rowIndexById\(key, rows, _wantId(, i)?\);/.test(c), 'the reply path finds by identifier');
  ok(!/rows\[i\]/.test(c.split('const _n=')[0].slice(-400)), 'and not by the position the page was drawn with');
  ok(/if\(_n<0\) throw rowGoneError\(key, _wantId\);/.test(c), 'and refuses when it is gone');
  ok(/const row=rows\[_n\];/.test(c) && !/const row=rows\[i\];/.test(c),
     'and writes to the row it found, not to the index the page was drawn with');
  ok(c.indexOf('rowIndexById') < c.indexOf('notifyContacts'),
     'the check runs before the notification, so a refused write sends no email');
}
{
  const c = html.split('async function wfAdvance')[1].split('\nasync function ')[0];
  ok(/const _n=rowIndexById\(key, rows, _wantId(, i)?\);/.test(c), 'so does the approve path');
  ok(/alert\(rowGoneError\(key,_wantId\)\.message\)/.test(c), 'which says the same thing');
  ok(/await loadDashboard\(\)/.test(c), 'and reloads, so the reader is not left looking at a ghost');
  ok(!/const row=rows\[i\]; if\(!row\) return;/.test(c), 'the positional lookup is gone');
}
// The server has always done this correctly for external callers; this is the
// same rule for the path that rewrites the whole file.
ok(/const row = rows\.find\(r => String\(r\[idField\] \|\| ''\) === String\(idValue \|\| ''\)\);/.test(srv),
   'the server finds by identifier');
ok(/if \(!row\) return json\(\{ error: 'item not found' \}, 404\);/.test(srv), 'and 404s when it is gone');

console.log((bad?'FAIL ':'ok   ')+'tools-test-staleindex.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
