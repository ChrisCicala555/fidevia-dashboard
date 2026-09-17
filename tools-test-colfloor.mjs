// "Text looks ridiculous when window in smaller — can we make the table
// slidable... Just don't let the description column condense down beyond a
// reasonable point."
//
// It was already sliding. The floor was a flat 116px per column, which is
// generous for a date and absurd for a description — so the table hit its floor
// and the prose came down the page one word at a time while Review Due sat half
// empty beside it.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage('index.html'); P.run(SEED);
const floor=(h)=>P.run(`colFloor(${JSON.stringify(h)})`);

console.log('A column gets the room what it holds needs');
{
  ok(floor('Description')===300, 'prose gets the most — it is the column people actually read');
  ok(floor('Subject')===300, 'and an RFI subject is prose by another name');
  ok(floor('Review Due')===110, 'a date is eight characters and never more');
  ok(floor('Submitted On')===110, 'whatever it is called');
  ok(floor('Status')===130, 'a pill needs its padding');
  ok(floor('Submitted By')===150, 'two lines of firm and person');
  ok(floor('Actions')===120, 'and the buttons need to stay side by side');
  ok(floor('Cost Impact')===116,
     'anything unrecognised keeps the old flat floor rather than being guessed at');
  ok(floor('')===116 && floor(null)===116, 'and an empty heading does not throw');
  ok(floor('description')===floor('DESCRIPTION'), 'matched however the heading is cased');
}

console.log('Description outweighs a date by a lot');
{
  ok(floor('Description') > floor('Review Due')*2,
     'which is the whole point — a flat floor gave them the same room and one of them wasted it');
}

console.log('The table floor is the sum of its columns');
{
  const w=html.split('function wrapTables(){')[1].split('\n}')[0];
  ok(/const w=colFloor\(th\.textContent\|\|''\);/.test(w), 'each heading is measured');
  ok(/th\.style\.minWidth=w\+'px'; total\+=w;/.test(w), 'the column is given its floor');
  ok(/t\.style\.minWidth=total\+'px';/.test(w),
     'and the table’s own floor is their sum, so it overflows the wrapper and slides rather than '
     +'compressing to fit');
  ok(/if\(ths\.length>=7\)\{/.test(w),
     'only for a table wide enough to need it — a narrow one still fills the space rather than '
     +'scrolling for no reason');
  ok(/ths\.forEach\(function\(th\)\{ th\.style\.minWidth=''; \}\);/.test(w),
     'and a table that drops below that width has its floors cleared, not left behind');
  ok(!/cols\*116/.test(html), 'the flat floor is gone');
}

console.log('And the wrapper is what slides');
{
  ok(/\.tscroll\{overflow-x:auto/.test(html), 'the wrapper scrolls');
  ok(/\.tscroll::-webkit-scrollbar\{height:10px\}|\.tscroll::-webkit-scrollbar\{height:10px;\}/.test(html),
     'with a visible track, so a table that slides says so rather than looking cut off');
  const w=html.split('function wrapTables(){')[1].split('\n}')[0];
  ok(/w\.className='tscroll'/.test(w), 'and every wide table is put inside one');
}

console.log(bad ? `FAIL tools-test-colfloor.mjs — ${bad} of ${n}` : `ok   tools-test-colfloor.mjs — ${n} assertions`);
process.exit(bad?1:0);
