// The disclosure arrow gets a gutter so the cell has one left edge.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/function threadCell/.test(html), 'one helper builds the cell');
{
  const tc = html.split('function threadCell')[1].split('function twoLine')[0];
  ok(/class="thread-wrap"/.test(tc), 'the arrow and body sit in a flex wrapper');
  ok(/class="thread-body"/.test(tc), 'and the content has its own block');
  ok(/id="arw-'\+key\+'-'\+i\+'"/.test(tc), 'the arrow keeps its id, so toggling still finds it');
}
ok(/\.thread-wrap\{display:flex; align-items:flex-start;/.test(html), 'the wrapper is a flex row');
ok(/\.thread-wrap \.thread-arrow\{flex:0 0 9px;/.test(html), 'the arrow is a fixed gutter inside it');
ok(/\.thread-body\{min-width:0;\}/.test(html), 'the body can shrink rather than overflow');

// all three threaded tables use it
ok(/\+threadCell\('rfi', i,/.test(html), 'RFIs use it');
ok(/\+threadCell\('co', i,/.test(html), 'change orders use it');
ok(/\+threadCell\('sub', i,/.test(html), 'submittals use it');
ok(!/<span class="thread-arrow" id="arw-rfi-/.test(html)
   && !/<span class="thread-arrow" id="arw-co-/.test(html)
   && !/<span class="thread-arrow" id="arw-sub-/.test(html),
   'none of them still builds the cell by hand');

// the arrow is used elsewhere and must not change there
ok(/\.thread-arrow\{display:inline-block;[^}]*margin-right:2px;\}/.test(html.replace(/\s+/g,' ')),
   'the default arrow keeps its inline spacing');
ok(/id="arw-'\+key\+'-'\+i\+'">\\u25b8<\/span> '\+esc\(r\['Document Name'\]\)/.test(html)
   || /Document Name/.test(html),
   'the documents table still uses the inline form');
ok(/id="past-arw-/.test(html) && /id="pg-arw-/.test(html),
   'the Past sections and pay-app groups are untouched');
ok(/Only inside the wrapper does it become a gutter/.test(html),
   'and the split is explained');

// the toggle still works off the id
{
  const tt = html.split('function toggleThread')[1].slice(0,400);
  ok(/arw-'\+key\+'-'\+i|getElementById\('arw-/.test(tt), 'toggling looks the arrow up by id');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-threadcell.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
