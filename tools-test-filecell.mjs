// A long filename and the download button on top of it.
//
// .attach-link is a 210px inline-flex box holding an icon and .attach-name.
// .attach-name had overflow:hidden and text-overflow:ellipsis and neither ever
// did anything, because a flex item defaults to min-width:auto — "never shrink
// below your own content". So the box stayed 210px, the text did not, and the
// name painted outside its own link. The download button is laid out
// immediately after that 210px box, which put it on top of the part that
// escaped: the icon you saw and the element under your cursor were not the
// same thing.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const rule = sel => { const i=html.indexOf('  '+sel+'{'); return i<0?'':html.slice(i, html.indexOf('}',i)+1); };

console.log('The three declarations that make the ellipsis work');
{
  const name = rule('.attach-name');
  ok(/min-width:0/.test(name),
     'the name may shrink — without this the other two are decorative');
  ok(/overflow:hidden/.test(name) && /text-overflow:ellipsis/.test(name),
     'and clips with an ellipsis once it can');
  const link = rule('.attach-link');
  ok(/max-width:210px/.test(link), 'the link is still capped, which is right in a table cell');
  ok(/overflow:hidden/.test(link),
     'and clips too, so nothing can paint outside the box the button is placed after');
  ok(/white-space:nowrap/.test(link), 'on one line');
}

console.log('The button is above the name, not beside-and-over it');
{
  const dl = rule('.dl-btn');
  ok(/position:relative/.test(dl) && /z-index:1/.test(dl),
     'so a click lands on the icon that is drawn there');
  ok(/flex:0 0 auto/.test(dl), 'and it never shrinks to make room for a long name');
  ok(/width:22px/.test(dl) && /height:22px/.test(dl), 'at a size worth aiming at');
}

console.log('Where this markup is used');
{
  const c = html.split('function fileCell')[1].split('\n// "Showing 1 to 5')[0];
  ok(/<span class="attach-name">/.test(c),
     'the file cell wraps the name in the class that clips — a bare name would overflow again');
  ok(/dlBtn\(fid, fn, rowItemNumber\(r\)\)/.test(c), 'with the button after it');
  ok(/display:inline-flex/.test(c), 'in a flex row, which is what placed the button after the capped box');
}
// The schedule list deliberately does not use it: those names are listed in
// full with room to wrap, which is why they have their own class.
ok(/\.file-line\{[^}]*overflow-wrap:anywhere/.test(html),
   'a name listed in full wraps instead, rather than being clipped to 210px');
{
  const after = html.split('function schedFilesHTML')[1];
  const c = after.slice(0, after.indexOf('\nfunction '));
  ok(/class="file-line"/.test(c) && !/attach-name/.test(c),
     'and the schedule rows use that one');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-filecell.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
