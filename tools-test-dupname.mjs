// A name already in the folder takes a suffix rather than stopping the upload.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const src = html.slice(html.indexOf('function dupSuffix'), html.indexOf('async function boxUploadOnce'));
const { dupName, dupSuffix } = new Function(src + '\nreturn {dupName,dupSuffix};')();
const d = new Date(), tag = 'Dup_'+(d.getMonth()+1)+'.'+d.getDate();

ok(dupSuffix()===tag, 'the suffix is Dup_ and today, as month.day');
ok(dupName('Site plan.pdf',1)==='Site plan '+tag+'.pdf', 'the extension stays on the end where it belongs');
ok(dupName('report.final.docx',1)==='report.final '+tag+'.docx', 'only the last dot is the extension');
ok(dupName('noext',1)==='noext '+tag, 'a file with no extension still works');
ok(dupName('Site plan.pdf',2)==='Site plan '+tag+' (2).pdf',
   'a second collision on the same day counts, rather than producing the same name again');
ok(dupName('',1)==='file '+tag, 'and an empty name does not produce a bare suffix');

// ── the retry ──
{
  const c = html.split('async function boxUploadBinary(file, parentId, onProgress)')[1].split('const ITEM_FOLDER_LABEL')[0];
  ok(/for\(let attempt=1; attempt<=8; attempt\+\+\)/.test(c), 'the retry is bounded');
  ok(/new File\(\[file\], dupName\(file\.name, attempt\)/.test(c), 'each attempt takes a fresh name');
  ok(/if\(!\/already exists\/i\.test\(e\.message\|\|''\)\) throw e;/.test(c),
     'and anything that is not a name clash is reported rather than retried under a new name');
  ok(/up\._renamedTo=renamed\.name/.test(c), 'the caller is told what it actually landed as');
  ok(/That name is already taken, and so are the alternatives tried/.test(c),
     'giving up says so plainly');
}
ok(/function boxUploadOnce/.test(html),
   'the single attempt is its own function, so the retry does not re-enter the proxy fallback logic');

// ── and the people uploading are told ──
{
  const c = html.split('async function docsUpload(input)')[1].split('function renderGenDocs')[0];
  ok(/if\(up && up\._renamedTo\) renamed\.push/.test(c), 'Documents collects what was renamed');
  ok(/That name was taken, so /.test(c), 'and says so when the upload finishes');
  ok(/renamed\.length\?7000:2500/.test(c), 'leaving the message up longer when there is something to read');
}
{
  const c = html.split('async function schedUpload(f, company, periodLabel, say)')[1].split('function schedChaseFooter')[0];
  ok(/One was already on file for that month, so this went up as /.test(c),
     'a second schedule in a month lands and says where, instead of being refused');
  ok(!/Rename yours, or replace it from the Documents tab/.test(c),
     'the old refusal is gone, since nothing refuses now');
  ok(/auditLog\('Schedule uploaded','gendocs',\{\}, company\+' \\u2014 '\+landed\)/.test(c),
     'and the record names the file that actually landed, not the one that was asked for');
}

// it still boots and the tab still runs
const b = bootPage('index.html'); b.run(SEED);
ok(b.errors.length===0, 'the page boots');
ok(typeof b.ctx.boxUploadBinary === 'function' && typeof b.ctx.boxUploadOnce === 'function',
   'both upload paths are reachable');

console.log((bad?'FAIL':'ok  '),' tools-test-dupname.mjs —',n,'assertions');
process.exit(bad?1:0);
