// An onclick built with JSON.stringify puts double quotes round its argument,
// which closes onclick=" early. The element renders, looks right, and does
// nothing — there is no error to see, because the browser simply parsed a
// truncated handler and some stray attributes.
//
// That is what happened to the workflow override button. This looks for the
// same mistake everywhere else it could be hiding.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

console.log('No handler is built by embedding JSON.stringify in a double-quoted attribute');
{
  // The shape: on<event>=" ... JSON.stringify( ... ) ... " with no single-quote
  // wrapping. Concatenated source, so this reads the code rather than markup.
  const hits=[];
  const re=/on(?:click|change|input|submit|blur|focus)="[^"]{0,400}?\+JSON\.stringify\(/g;
  let m; while((m=re.exec(html))) hits.push(html.slice(m.index, m.index+120));
  ok(hits.length===0,
     'nothing embeds a JSON.stringify result straight into a double-quoted handler'
     + (hits.length?(' — '+hits.join(' | ')):''));
}

console.log('The override button specifically');
{
  const w = html.split('function wfProgressHTML')[1].split('\n}')[0];
  const line = (w.match(/openWfOverride\([^)]*\)/)||[''])[0];
  ok(/openWfOverride\(\\'/.test(w) || /openWfOverride\('\s*\+/.test(w) || /\\''\n?\s*\+esc\(key\)/.test(w),
     'passes its key inside escaped single quotes');
  ok(!/JSON\.stringify\(key\)/.test(w), 'and not through JSON.stringify, which quotes with the wrong character');
}

console.log('The pattern the rest of the file already used');
ok(/askDelete\(event,\\'/.test(html), 'delBtn escapes single quotes, which is what this should have copied');

console.log((bad?'FAIL ':'ok   ')+'tools-test-attrquotes.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
