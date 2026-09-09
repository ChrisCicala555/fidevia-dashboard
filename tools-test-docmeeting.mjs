// Filing minutes from the Documents tab asks what the Meeting Minutes tab
// asked, and the answers travel with the file rather than into a second index.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);

// ── the same form, borrowed whole ──
ok(/FORMS\.docmeeting=\{title:'Add Meeting Minutes', html:FORMS\.meeting\.html\}/.test(html),
   'the retired tab’s form is reused rather than rebuilt, so the questions cannot drift apart');
b.run("openModal('docmeeting')");
const body = b.run("document.getElementById('modal-body').innerHTML");
['f-date-sub','f-mtype','f-attendees','f-subject','f-file'].forEach(f=>
  ok(body.includes('id="'+f+'"'), 'it still asks for '+f));

// ── only in the folder it belongs to ──
const formIn = name => { b.run(`DOCS_PATH.length=0; ${name?`DOCS_PATH.push({id:'1',name:${JSON.stringify(name)}});`:''}`);
                         return b.run('docsFolderForm()'); };
ok(formIn('Meeting Minutes')==='docmeeting', 'Upload in Meeting Minutes opens the form');
ok(formIn('meeting minutes')==='docmeeting', 'whatever case the folder is in');
ok(formIn('Testing')==='', 'anywhere else uploads a file as before');
ok(formIn('')==='', 'and so does the root');
ok(/onclick="event\.preventDefault\(\);docsUploadClick\(\);"/.test(html),
   'the Upload control routes through that check rather than always opening a picker');

// ── what it does with the answers ──
{
  const c = html.split('async function submitDocMeeting()')[1].split('async function docsRename')[0];
  ok(/if\(!date\) throw new Error\('Date is required\.'\)/.test(c), 'a date is required, as it was');
  ok(/throw new Error\('Attach the minutes file\.'\)/.test(c),
     'and a file, since the folder is the record now');
  ok(/safeFileName\(date\+' \\u2014 '\+type\)\+ext/.test(c),
     'the file is named for the date and the kind of meeting');
  ok(/boxUploadBinary\(new File\(\[file\], name/.test(c), 'and filed into the folder being looked at');
  ok(/docsHere\(\)/.test(c), 'wherever that is');
  ok(/proxyCall\('docsDescribe'/.test(c),
     'attendees and the summary go onto the file, not into a second index');
  ok(!/MODULES\.meetings|'meetings'/.test(c),
     'and nothing is written to the retired log');
  ok(/auditLog\('Filed meeting minutes'/.test(c), 'the filing is on the record');
}
ok(/if\(currentModal==='docmeeting'\) return submitDocMeeting\(\);/.test(html),
   'it is handled before the CSV path, which is about rows');

// ── the note comes back and is shown ──
ok(/fields=id,name,type,size,modified_at,description/.test(srv),
   'the listing asks Box for the description');
ok(/e\.description\?\('<div class="cell-sub"/.test(html),
   'and the row shows it, so the folder reads as a log rather than a pile of PDFs');
{
  const c = srv.split("if (op === 'docsDescribe')")[1].split("if (op === 'docsList')")[0];
  ok(/guardFile/.test(c), 'describing a file is guarded');
  ok(/docsAllows\(H, t, _grants, who, parentId\)/.test(c),
     'by the same rule as filing into the folder: if you may file here, you may say what you filed');
  ok(/slice\(0, 4000\)/.test(c), 'and the note is bounded');
}

console.log((bad?'FAIL':'ok  '),' tools-test-docmeeting.mjs —',n,'assertions');
process.exit(bad?1:0);
