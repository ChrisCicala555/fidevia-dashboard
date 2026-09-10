// A change order is numbered PCO-GC-001 while it is a proposal and gains a CO
// number only when it is executed. Two things looked only at 'CO #', which is
// blank on every proposal:
//
//   nextItemNumber scanned that column, found nothing, and handed out 001
//   again — so a log of proposals was a log of PCO-GC-001s;
//
//   the stale-row guard took the identity from it too, so a proposal had no
//   identity, a blank identity matched nothing, and every review of a PCO was
//   refused with "no longer in the log — it was deleted or renumbered".
//
// The second is the one Christopher hit. The first is why he had two rows
// numbered the same, which is what made the fix need care: with duplicates in
// the log, finding "the row called PCO-GC-001" is ambiguous.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P = bootPage(); P.run(SEED);
const R = e => P.run(e);

console.log('What a change order is called');
ok(R(`rowIdOf('co',{'CO #':'CO-GC-004','PCO #':'PCO-GC-004'})`)==='CO-GC-004',
   'an executed one answers to its CO number');
ok(R(`rowIdOf('co',{'CO #':'','PCO #':'PCO-GC-002'})`)==='PCO-GC-002',
   'a proposal answers to its PCO number — this is the whole bug');
ok(R(`rowIdOf('co',{})`)==='' , 'and one with neither has no identity');
ok(R(`rowIdOf('rfi',{'RFI #':'RFI-GC-001','PCO #':'x'})`)==='RFI-GC-001',
   'an RFI is unaffected');
ok(R(`rowIdOf('sub',{'Submittal #':'','PCO #':'PCO-GC-001'})`)==='',
   'and no other module borrows the PCO column');

console.log('Numbering a run of proposals');
R(`allData.co=[]; currentProject.config.contractors=[{name:'Summit Builders',role:'GC',active:true}]`);
const nextCo = () => R(`nextItemNumber('co','Summit Builders')`);
ok(nextCo()==='CO-GC-001', 'the first is 001');
R(`allData.co=[{'PCO #':'PCO-GC-001','CO #':'','Company':'Summit Builders'}]`);
ok(nextCo()==='CO-GC-002', 'with one proposal on the log the next is 002, not 001 again');
R(`allData.co=[{'PCO #':'PCO-GC-001','CO #':'','Company':'Summit Builders'},
               {'PCO #':'PCO-GC-002','CO #':'','Company':'Summit Builders'}]`);
ok(nextCo()==='CO-GC-003', 'and it keeps counting');
R(`allData.co=[{'PCO #':'PCO-GC-001','CO #':'CO-GC-001','Company':'Summit Builders'},
               {'PCO #':'PCO-GC-002','CO #':'','Company':'Summit Builders'}]`);
ok(nextCo()==='CO-GC-003', 'an executed one and a proposal share the run rather than each starting their own');

console.log('Finding the row again');
const rows = `[{'PCO #':'PCO-GC-001','CO #':'','Description':'Wall'},
               {'PCO #':'PCO-GC-002','CO #':'','Description':'Rewiring'},
               {'PCO #':'PCO-GC-003','CO #':'CO-GC-003','Description':'Done'}]`;
ok(R(`rowIndexById('co',${rows},'PCO-GC-002',1)`)===1, 'a proposal is found by its PCO number');
ok(R(`rowIndexById('co',${rows},'CO-GC-003',2)`)===2, 'and an executed one by its CO number');
ok(R(`rowIndexById('co',${rows},'pco-gc-002',0)`)===1, 'case and stale hints do not matter when it is unique');
ok(R(`rowIndexById('co',${rows},'PCO-GC-009',0)`)===-1, 'one that is really gone is still reported gone');
ok(R(`rowIndexById('co',${rows},'',1)`)===-1, 'and a blank identity matches nothing rather than the first row');
{
  // The row that matters here is one with neither number — a half-written
  // record. Without the guard a blank identity would match a blank row, and a
  // review would be written to whatever happened to be malformed that day.
  const withBlank = `[{'PCO #':'PCO-GC-001','CO #':''},{'PCO #':'','CO #':'','Description':'half-written'}]`;
  ok(R(`rowIndexById('co',${withBlank},'',1)`)===-1,
     'and it does not match a row that has no number either');
}

console.log('When the log carries duplicates, which it now does');
const dupes = `[{'PCO #':'PCO-GC-001','CO #':'','Description':'Make Wall Bigger'},
                {'PCO #':'PCO-GC-001','CO #':'','Description':'Rewiring to Panel IX'}]`;
ok(R(`rowIndexById('co',${dupes},'PCO-GC-001',1)`)===1,
   'the row the page was looking at is the one written to — not whichever came first');
ok(R(`rowIndexById('co',${dupes},'PCO-GC-001',0)`)===0, 'either way round');
ok(R(`rowIndexById('co',${dupes},'PCO-GC-001',7)`)===-1,
   'and if the remembered position is not one of them the write is refused, because guessing between two records is worse than stopping');
{
  const f = html.split('function rowIndexById')[1].split('\n}')[0];
  ok(/if \(hits\.length===1\) return hits\[0\];|if\(hits\.length===1\) return hits\[0\];/.test(f),
     'a unique match needs no hint at all');
}

console.log('The guard is wired to the same identity');
ok(/REPLY_CTX=\{key,i,advance:!!advance,id:rowIdOf\(key,r\)\}/.test(html),
   'the dialog remembers what the row is called');
ok((html.match(/rowIndexById\(key, rows, _wantId, i\)/g)||[]).length===2,
   'and both write paths look it up the same way, passing the position as a tiebreak');
ok(!/String\(\(_r0\|\|\{\}\)\[REPLY_IDF\[key\]\]\|\|''\)/.test(html)
   && !/String\(\(\(allData\[key\]\|\|\[\]\)\[i\]\|\|\{\}\)\[REPLY_IDF\[key\]\]\|\|''\)/.test(html),
   'and neither still reads REPLY_IDF directly, which is what blanked a proposal’s identity');

console.log((bad?'FAIL ':'ok   ')+'tools-test-pcoident.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
