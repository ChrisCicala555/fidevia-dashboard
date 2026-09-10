// Cause was a dropdown on the proposal form — Unforeseen, Owner Request, Code,
// Error, Omission, Other — printed on the change order and shown as a pill in
// the log. Removed at Christopher's request: it was a classification nobody was
// using, and one asked for at the moment somebody knows least about the change.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

console.log('Gone from the form');
{
  const f = html.split("  co:{title:'New PCO'")[1].split('`},')[0];
  ok(!/id="f-cause"/.test(f), 'no field');
  ok(!/Unforeseen|Owner Request/.test(f), 'and none of its options linger');
  ok(/id="f-cost"/.test(f), 'while the cost impact beside it stays');
  ok(/<div class="field"><\/div><\/div>/.test(f),
     'the half it occupied is held open, so the cost field keeps its width instead of stretching across the row');
}
ok(!/v\('f-cause'\)/.test(html), 'nothing reads it when a proposal is submitted');
ok(/'Cause':''/.test(html), 'and a new row records it blank rather than omitting the key');

console.log('Gone from the log');
{
  const head = html.split('<th>PCO / CO #</th>')[1].split('</tr>')[0];
  ok(!/<th>Cause<\/th>/.test(head), 'no column');
  ok(/<th>Description<\/th><th>Submitted By<\/th>/.test(head), 'and the two either side of it now meet');
}
ok(!/const cause=r\['Cause'\]/.test(html), 'no cell is built for it');
{
  const rc = html.split('function renderCOs(){')[1].split('\n}')[0];
  ok(/emptyRow\(9\)/.test(rc), 'the empty row spans one column fewer');
  ok(/verThreadRows\('co',r,i,10\)/.test(rc), 'so does the version thread beneath each change order');
}
ok(/<tbody id="tbody-cos"><tr class="loading-row"><td colspan="10">/.test(html),
   'and so does the loading row — a colspan left too wide pushes the table out of shape');

console.log('Gone from the generated change order');
{
  const g = html.split('const ids=[')[1].split('];')[0];
  ok(!/Cause/.test(g), 'the identifier boxes no longer carry it');
  ok(/Contract type/.test(g) && /Originating PCO/.test(g) && /Contract date/.test(g),
     'the other three remain');
}
ok(/const iw=\(W-2\*M\)\/ids\.length;/.test(html),
   'and the box width follows the count, so dropping one closes the gap rather than leaving a quarter of the row empty');

console.log('Kept where removing it would destroy something');
// The explanation is a comment spanning several lines, so match one line of it
// rather than a phrase that a line break runs through.
// The note now covers Cause and Schedule Impact together, so match the part
// about the columns rather than a sentence that has since gained a second
// subject.
ok(/dropped from the forms and from the generated change order[\s\S]{0,300}const MODULES = \{/.test(html),
   'the column stays in the log, with the reason written down beside the headers it belongs to');
{
  const hdr = html.split("co:       {folder:'02 - Change Orders'")[1].split(']}')[0];
  ok(/'Cause'/.test(hdr),
     'because a change order that recorded a cause keeps it — dropping the header erases that history the next time the log is written');
}
{
  // Rows already carrying a cause must survive a round trip through the log.
  const P = bootPage(); P.run(SEED);
  P.run(`ROWS=[{'PCO #':'PCO-001','Cause':'Owner Request','Description':'x'}]`);
  const back = P.run(`JSON.stringify(parseCSV(toCSV(MODULES.co.headers, ROWS)).rows[0]['Cause'])`);
  ok(back === '"Owner Request"', 'and it reads back unchanged after the log is rewritten');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-nocause.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
