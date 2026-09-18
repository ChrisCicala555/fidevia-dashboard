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
  // esc(JSON.stringify(x)) is the safe form: esc turns the quotes JSON adds
  // into &quot;, which the attribute parser hands back as quotes, and an
  // apostrophe in a name survives too. Only the raw call is the bug.
  const re=/on(?:click|change|input|submit|blur|focus)="[^"]{0,400}?\+(?!esc\(JSON)JSON\.stringify\(/g;
  let m; while((m=re.exec(html))) hits.push(html.slice(m.index, m.index+120));
  ok(hits.length===0,
     'nothing embeds a JSON.stringify result straight into a double-quoted handler'
     + (hits.length?(' — '+hits.join(' | ')):''));
}

console.log('Nor by URI-encoding it, which is the same mistake wearing a hat');
{
  // encodeURIComponent does NOT escape an apostrophe. A contract line encoded
  // into a single-quoted argument therefore ended early for "Cook's Service
  // Company", the handler would not parse, and the button was dead for that one
  // firm with nothing logged. esc(JSON.stringify(x)) is the form that works.
  const re=/on(?:click|change|input|submit|blur|focus)="[^"]{0,400}?\+\s*encodeURIComponent\(/g;
  const hits=[]; let m; while((m=re.exec(html))) hits.push(html.slice(m.index, m.index+120));
  ok(hits.length===0,
     'no handler carries a URI-encoded value'+(hits.length?(' \u2014 '+hits.join(' | ')):''));
}

console.log('What a handler may carry instead');
{
  // The way out of quoting a name is not to quote it: pass where the thing sits
  // and look it up on the other side.
  const btn=(html.match(/onclick="alwAdd\([^"]*\)"/)||[''])[0];
  ok(/alwAdd\(\\'{0,2}'\+prefix\+'\\'{0,2},'\+li\+'\)/.test(btn) || /alwAdd\([^"]*\+li\+/.test(btn),
     'the Add Allowance button carries a position');
  ok(!/c\.name/.test(btn), 'and no company name');
  ok(!/encodeURIComponent/.test(btn), 'and nothing URI-encoded');
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
