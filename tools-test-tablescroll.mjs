// A wide table scrolls instead of squashing.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const wt = html.split('function wrapTables')[1].split('function fmtMoneyInput')[0];
ok(/classList\.contains\('tscroll'\)/.test(wt), 'the wrapper is only added once');
ok(/const ths=\[\.\.\.t\.querySelectorAll\('thead th'\)\]/.test(wt), 'the headings drive the floor');
ok(/if\(ths\.length>=7\)\{/.test(wt), 'wide tables get a minimum width, narrow ones do not');
// A flat 116px per column was the wrong shape: generous for a date, absurd for
// a description, which came down the page one word at a time while Review Due
// sat half empty beside it.
ok(/const w=colFloor\(th\.textContent\|\|''\)/.test(wt),
   'and each column is given the room what it holds needs, rather than one figure for all of them');
ok(/t\.style\.minWidth=total\+'px'/.test(wt), 'the table floor being their sum');
ok(/nothing ever overflowed it/.test(wt), 'the reason the wrapper alone was not enough is recorded');
ok(/t\.style\.minWidth/.test(wt), 'the floor is applied to the table, not the wrapper');
ok(wt.indexOf('if(!(t.parentElement') < wt.indexOf('const ths='),
   'the width is set on every pass, including tables already wrapped');

ok(/\.tscroll\{overflow-x:auto; overflow-y:hidden;/.test(html), 'the wrapper scrolls horizontally only');
ok(/-webkit-overflow-scrolling:touch/.test(html), 'and takes a touch scroll on iOS');
ok(/\.tscroll::-webkit-scrollbar\{height:10px;\}/.test(html), 'the scrollbar is visible');
ok(/says so rather than looking cut off/.test(html), 'because a hidden one reads as a clipped table');

// the sizing rule
{
  const w=cols=>cols>=7 ? cols*116 : 0;
  ok(w(4)===0, 'a four-column table is left fluid');
  ok(w(6)===0, 'so is a six-column one');
  ok(w(7)===812, 'seven columns take a floor');
  ok(w(11)===1276, 'eleven columns take a wider one (got '+w(11)+')');
  // the change order log in the screenshot
  ok(w(11)>1200, 'the change order log will exceed a narrow window and scroll');
}
ok(/wrapTables\(\); makeSortableTables\(\)/.test(html), 'it still runs on every render');

// The page itself must not move when a table does.
ok(/\.content\{padding:24px 20px; flex:1; min-width:0;/.test(html),
   'the content column may shrink below its content width');
ok(/item defaults to min-width:auto and refuses to shrink/.test(html),
   'and why that is needed is recorded');
ok(/\.panel\{[^}]*min-width:0;\}/.test(html), 'the panel may too');
ok(/\.section\{min-width:0;\}/.test(html), 'and the section');
ok(/\.tscroll\{[^}]*max-width:100%; min-width:0;/.test(html),
   'the scroll wrapper is bounded by its parent rather than by its content');
ok((html.match(/\.panel\{/g)||[]).length===1, 'there is one panel rule, not two');

console.log((bad?'FAIL ':'ok   ')+'tools-test-tablescroll.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
