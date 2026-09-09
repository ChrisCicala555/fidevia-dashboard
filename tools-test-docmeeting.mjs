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

// Filing in a subfolder is still filing minutes. Keyed off the standard folder
// you are under, not the one you are standing in.
const deep = (...names) => { b.run(`DOCS_PATH.length=0; ${names.map(x=>`DOCS_PATH.push({id:'x',name:${JSON.stringify(x)}});`).join('')}`);
                             return b.run('docsFolderForm()'); };
ok(deep('Meeting Minutes','JC Meetings')==='docmeeting', 'and in a subfolder of it');
ok(deep('Meeting Minutes','JC Meetings','2026')==='docmeeting', 'however deep');
ok(deep('Testing','Concrete')==='', 'while a subfolder elsewhere still just uploads');

// The control was a <label> wrapping the file input. Cancelling the label's
// default and then calling input.click() re-entered the label, and the picker
// never opened — Upload did nothing at all outside the folders with a form.
ok(/<button class="btn-add" type="button" onclick="docsUploadClick\(\)">/.test(html),
   'Upload is a button, not a label wrapped around the input it triggers');
// Scoped to this control: the site photos uploader is a plain label with no
// preventDefault, which works, and is not what this is about.
ok(!/<label[^>]*>\s*\+ Upload\s*\n\s*<input[^>]*id="docs-upload"/.test(html),
   'so nothing re-enters itself');
ok(/id="docs-upload"[^>]*>\s*<\/div>|<input type="file" multiple id="docs-upload"[^>]*>\s*\n\s*<\/div>/.test(html)
   || html.indexOf('<button class="btn-add" type="button" onclick="docsUploadClick()">')
      < html.indexOf('id="docs-upload"'),
   'the input sits beside the button rather than inside it');
{
  // And it really does reach one or the other.
  const clicks = (...names) => {
    b.run(`DOCS_PATH.length=0; ${names.map(x=>`DOCS_PATH.push({id:'x',name:${JSON.stringify(x)}});`).join('')}
           globalThis.__c=0; globalThis.__o=''; document.getElementById('docs-upload').click=()=>{__c++;};
           openModal=(t)=>{__o=t;};`);
    b.ctx.docsUploadClick();
    return { picker: b.run('__c'), form: b.run('__o') };
  };
  const plain = clicks('Testing','Concrete');
  ok(plain.picker===1 && plain.form==='', 'a plain folder opens the file picker');
  const mins = clicks('Meeting Minutes','JC Meetings');
  ok(mins.picker===0 && mins.form==='docmeeting', 'a minutes subfolder opens the form instead');
}

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
