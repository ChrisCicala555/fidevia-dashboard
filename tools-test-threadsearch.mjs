// The filter reads the review thread, not just the row it is collapsed into.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

{
  const c = html.split('function applyFilter(panel)')[1].split('function reapplyFilters')[0];
  ok(/const inHead = !q \|\| head\.textContent/.test(c), 'the collapsed row still matches as before');
  ok(/g\.slice\(1\)\.some\(/.test(c), 'and so does everything in the thread beneath it');
  ok(/!inHead\s*\n?\s*&&/.test(c) || /!inHead$/m.test(c),
     'the thread is only consulted when the row itself did not match');
  ok(/if\(inThread\) setThreadOpen\(row, true, true\)/.test(c),
     'a row matched on hidden text opens to show what matched');
  ok(/else if\(row\._filterOpened\) setThreadOpen\(row, false, true\)/.test(c),
     'and closes again when the next search does not need it');
  ok(/matched in the replies/.test(c), 'the count says how many came from the thread');
  ok(/hasThreads && inp\.placeholder\.indexOf\('replies'\)<0/.test(c),
     'the box only claims to search replies where there are replies');
}
{
  const c = html.split('function setThreadOpen(detail, open, byFilter)')[1].split('function applyFilter')[0];
  ok(/arw\.style\.transform = open \? 'rotate\(90deg\)' : 'rotate\(0deg\)'/.test(c),
     'opening a thread moves its arrow, so it cannot show its history while claiming to be closed');
  ok(/if\(byFilter && !wasOpen\) detail\._filterOpened=true/.test(c),
     'only threads the filter opened are remembered as its own');
  ok(/else detail\._filterOpened=false/.test(c), 'and the mark is cleared when they close');
  ok(/if\(open && rowHiddenFromViewer\(detail\)\) return;/.test(c),
     'a row hidden from this viewer is never opened');
}
// ── the leak this would otherwise have opened ──
{
  const c = html.split('function rowHiddenFromViewer(row)')[1].split('function setThreadOpen')[0];
  ok(/hide-external/.test(c) && /external-mode/.test(c),
     'internal-only rows are recognised');
}
ok(/g\.slice\(1\)\.some\(r=>!rowHiddenFromViewer\(r\) &&/.test(html),
   'and are skipped when searching, so a contractor cannot confirm what a hidden note says by watching what survives the filter');
ok(/would let them confirm what a hidden note says/.test(html), 'with the reason recorded');
ok(/display:none !important/.test(html),
   'the CSS that hides them still beats the inline display the filter writes');

// The thread rows this reads are the ones that carry the reply notes.
{
  const c = html.split('function verThreadRows')[1].split('function backfillVersionAuthors')[0];
  ok(/class="thread-detail"/.test(c), 'submittals, RFIs and change orders render one');
  ok(/v\.note/.test(c), 'holding the reply notes');
  ok(/Response on file/.test(c), 'and the older free-text response');
}

console.log((bad?'FAIL':'ok  '),' tools-test-threadsearch.mjs —',n,'assertions');
process.exit(bad?1:0);
