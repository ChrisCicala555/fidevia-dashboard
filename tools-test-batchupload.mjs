// A contractor filing a week of reports should not open the form seven times.
// Fidevia's own daily report stays one at a time: it carries weather, crew
// count and work performed, which describe one day and cannot be shared across
// a batch.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const form=k=>{ const i=html.indexOf('  '+k+':{'); return i<0?'':html.slice(i, html.indexOf('`},', i)); };
const fileInput=k=>{ const m=form(k).match(/type="file"[^>]*id="f-file"/); return m?m[0]:''; };

console.log('Which forms take several');
for(const k of ['cdaily','cdaily_ext','payroll'])
  ok(/multiple/.test(fileInput(k)), k+' accepts a batch');
for(const k of ['daily','payapp','payapp_ext','meeting','board'])
  ok(fileInput(k) && !/multiple/.test(fileInput(k)), k+' stays one at a time');
ok(/BATCH_FORMS=\['cdaily','cdaily_ext','payroll'\]/.test(html),
   'and the code agrees with the markup about which those are');
{
  // The markup alone would let a browser hand over several files to a form
  // that only reads the first. The two lists have to match.
  const marked=['cdaily','cdaily_ext','payroll','daily','payapp','payapp_ext','meeting','board']
    .filter(k=>/multiple/.test(fileInput(k)));
  const listed=(html.match(/BATCH_FORMS=\[([^\]]*)\]/)[1].match(/'([^']+)'/g)||[]).map(x=>x.replace(/'/g,''));
  ok(marked.sort().join()===listed.sort().join(),
     'no form offers a batch the code would silently drop ('+marked.join(', ')+')');
}

console.log('One row per file');
{
  const c = html.split('const _newRows=[newRow];')[1].split('const _failed=')[0];
  ok(/Object\.assign\(\{\}, newRow\)/.test(c), 'the extra rows copy the one that was built');
  ok(/_r\['Attachment File ID'\]=_ok\[_i\]\.id/.test(c), 'each carrying its own file');
  ok(/if\(headers\.includes\('Payroll #'\)\) _r\['Payroll #'\]=''/.test(c),
     'except the payroll number, which cannot describe several payrolls at once');
}
{
  const c = html.split('const _newRows=[newRow];')[1].split('try{ _newRows.forEach')[0];
  ok(/for\(const _r of _newRows\) await proxyCall\('appendRow'/.test(c), 'all of them are written, externally');
  ok(/_newRows\.forEach\(_r=>rows\.push\(_r\)\)/.test(c), 'and internally');
}
ok(/_newRows\.forEach\(_r=>auditLog\('Created', key, _r,/.test(html),
   'and every one is audited, not just the first');

console.log('A batch survives one bad file');
{
  const c = html.split('const _files=[...fi.files];')[1].split('let _senderEmail')[0];
  ok(/catch\(e\)\{\s*\n\s*if\(!_many\) throw e;/.test(c),
     'a single upload still fails loudly');
  ok(/_batch\.push\(\{id:'', name:_f\.name, error:/.test(c),
     'while one bad file in a batch is set aside rather than taking the rest with it');
  ok(/if\(!_ok\.length && _batch\.length\) throw new Error\('Nothing could be uploaded/.test(c),
     'and a batch where nothing landed is an error, not a silent success');
  ok(/Uploading '\+_f\.name\+' \('\+\(_i\+1\)\+' of '\+_list\.length/.test(c),
     'with progress that says which one it is on');
}
ok(/could not be uploaded: '\s*\n?\s*\+_failed\.map\(x=>x\.name\)\.join/.test(html.replace(/\s+/g,' ').replace(/' \+/g,"'+"))
   || /_failed\.map\(x=>x\.name\)\.join/.test(html),
   'and the ones that failed are named afterwards');

console.log('The forms say so');
ok(/each becomes its own row, sharing the date and company above/.test(form('cdaily')),
   'the daily report form explains what a batch does');
ok(/each becomes its own row, sharing the week ending and company above/.test(form('payroll')),
   'so does the payroll form');
ok(!/Choose several/.test(form('daily')), 'and Fidevia’s own daily report does not offer it');

console.log((bad?'FAIL ':'ok   ')+'tools-test-batchupload.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
