// Saving a file is a different act from opening one, and every attachment can
// now be saved under a name that means something.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ── naming ──
{
  const c = html.split('function safeFileName')[1].split('function dlName')[0];
  ok(/\[\\\/\\\\:\*\?"<>\|/.test(c), 'characters a filesystem will not take are stripped');
  ok(/u0000-\\u001f/.test(c), 'including control characters');
  ok(/slice\(0,120\)/.test(c), 'and the result is bounded');
  ok(/replace\(\/\^\[\.\\-\\s\]\+\/,''\)/.test(c), 'a leading dot cannot make it a hidden file');
}
{
  const c = html.split('function dlName(original, prefix)')[1].split('async function downloadBoxFile')[0];
  ok(/match\(\/\\\.\[A-Za-z0-9\]\{1,8\}\$\/\)/.test(c), 'the extension survives renaming');
  ok(/if\(!p\) return safeFileName\(o\)\|\|'download'/.test(c),
     'with no prefix the original name is kept rather than invented');
  ok(/base\.toLowerCase\(\)\.indexOf\(p\.toLowerCase\(\)\)>=0/.test(c),
     'and a number already in the filename is not repeated');
}
ok(/function rowItemNumber\(r\)/.test(html), 'a row is asked what it calls itself');
{
  const c = html.split('function rowItemNumber(r)')[1].split('function fileCell')[0];
  ['RFI #','Submittal #','CO #','PCO #','App #','Payroll #'].forEach(k =>
    ok(c.indexOf("'"+k+"'")>=0, 'it knows about '+k));
  ok(/return '';/.test(c), 'and returns nothing rather than guessing');
}

// ── the download itself ──
ok(/function saveAs\(href, name\)/.test(html), 'there is one way to save');
{
  const c = html.split('function saveAs(href, name)')[1].split('function safeFileName')[0];
  ok(/a\.download = name|if\(name\) a\.download=name/.test(c), 'which sets the filename');
  ok(/a\.remove\(\)/.test(c), 'and does not litter the document with anchors');
}
{
  const c = html.split('async function downloadBoxFile')[1].split('function dlBtn')[0];
  ok(/const el = ev && ev\.currentTarget;/.test(c),
     'the button is captured before the first await, when it still exists');
  ok(/proxyCall\('downloadUrl'/.test(c), 'the link is fetched through the proxy, which checks access');
  ok(/const r=await fetch\(d\.url\)/.test(c), 'the bytes are read so the name can be ours');
  ok(/if\(!named\) saveAs\(d\.url, name\)/.test(c),
     'and a blocked cross-origin read still downloads, under the original name');
  ok(/revokeObjectURL/.test(c), 'the blob url is released');
  ok(/Could not download that file/.test(c), 'a failure says so rather than doing nothing');
  ok(/dl-busy/.test(c), 'and the control cannot be pressed twice while it works');
}
ok(/\.dl-btn\{/.test(html) && /\.dl-btn\.dl-busy\{/.test(html), 'it has a style, and a busy state');

// ── where it appears ──
{
  const c = html.split('function fileCell(r)')[1].split('// "Showing 1 to 5')[0];
  ok(/dlBtn\(fid, fn, rowItemNumber\(r\)\)/.test(c),
     'the shared attachment cell carries one, so every module that uses it gains one');
}
ok(/dlBtn\(r\['Attachment File ID'\], r\['Attachment Name'\]\|\|'', pfx\)/.test(html),
   'a pay application can be saved');
ok(/dlBtn\(r\['Signed File ID'\], r\['Signed File Name'\]\|\|'', \(pfx\?pfx\+' ':''\)\+'signed'\)/.test(html),
   'and so can the signed copy, told apart by name');
ok(/String\(r\['Contractor'\]\|\|''\)\.trim\(\)\]\.filter\(Boolean\)\.join\(' '\)/.test(html),
   'a pay app is named for its contractor as well as its number, since two firms both have an App 3');
ok(/dlBtn\(e\.id, e\.name, ''\)/.test(html), 'a filed document keeps the name it was filed under');
ok(/dlBtn\(fid, fn, 'Daily log '/.test(html), 'a daily log is named for its date');
ok((html.match(/dlBtn\(v\.fileId, v\.fileName/g)||[]).length===2,
   'both version histories offer every revision, not just the current file');
ok(/'v'\+v\.v/.test(html), 'and say which revision');

// ── access is unchanged ──
{
  const c = srv.split("if (op === 'downloadUrl')")[1].split("if (op === 'fileInfo')")[0];
  ok(/guardFile\(body\.fileId\)/.test(c), 'the server still guards the file');
  ok(/callerMayReadFile/.test(c), 'and still checks the caller may read this one');
}
ok(!/downloadBoxFile[\s\S]{0,400}?isAdmin/.test(html),
   'the client does not decide who may download — the server already does');

console.log((bad?'FAIL':'ok  '),' tools-test-download.mjs —',n,'assertions');
process.exit(bad?1:0);
