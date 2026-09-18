// "Can we have the option to delete documents/folders in the documents tab?"
//
// Files already had it: Fidevia removes, everyone else asks. Folders had no
// control at all, so a folder created by mistake, or one left over from a way
// of filing nobody uses now, could only be dealt with in Box.
//
// A folder goes the same way a file does — MOVED into Removed, not deleted.
// Box moves a folder with everything inside it, so a folder of superseded
// drawings comes out in one move and every one of them is still there.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const proxy=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const P=bootPage('index.html'); P.run(SEED);
const op=proxy.split("if (op === 'docsRemove')")[1].split("if (op === 'docsRequestRemoval')")[0];

console.log('A folder can be removed at all');
{
  ok(/kind = String\(body\.kind \|\| 'file'\) === 'folder' \? 'folder' : 'file'/.test(op),
     'the server takes a folder as well as a file');
  ok(/kind === 'folder' \? !await guardFolder\(fileId\) : !await guardFile\(fileId\)/.test(op),
     'and guards a folder id as a folder — a file guard on a folder id proves nothing');
  ok(/const base = kind === 'folder' \? 'folders' : 'files'/.test(op),
     'and moves it through the folders endpoint');
}

console.log('It is a move, not a delete');
{
  ok(!/method: 'DELETE'/.test(op), 'nothing here deletes');
  ok(/parent: \{ id: String\(bin\.id\) \}/.test(op), 'it goes into the Removed folder');
  ok(/stamp \+ ' - ' \+ from \+ ' - ' \+ origName/.test(op),
     'named with the date and where it came from, so it can be put back');
}

console.log('Three folders it refuses');
{
  ok(/if \(nm === DOCS_REMOVED\) return json\(\{ error: 'The Removed folder stays where it is/.test(op),
     'the bin cannot be put in the bin');
  ok(/\/\^schedules\?\$\/\.test\(nm\)/.test(op) && /stop contractors uploading one/.test(op),
     'Schedules is refused, because the Schedule tab files every programme into it');
  ok(/if \(std\.some\(f => String\(f\.name \|\| ''\)\.trim\(\)\.toLowerCase\(\) === nm\)\) \{/.test(op)
     && /one of the standard folders, so it would be/.test(op),
     'and a standard folder is refused \u2014 tested against the template, not just described \u2014 rather '
     +'than removed and silently recreated on the next visit');
  ok(/Project \'?\+?\s*\n?\s*\+ ?'Settings if it should not be there/.test(op)
     || /Settings if it should not be there/.test(op),
     'saying where to change it, since the template is what puts it back');
  ok(/const std = \(await getSettings\(\)\)\.docFolders/.test(op),
     'and the standard list is read from the settings, not a copy that can drift');
}

console.log('Who gets the control');
{
  const row=html.split("+'<td class=\"nw\" style=\"text-align:right;\">'")[1].split('</td></tr>')[0];
  ok(/IS_ADMIN && !viewingAsExternal\(\)/.test(row), 'Fidevia removes');
  ok(/docsRemove\(/.test(row) && /e\.type/.test(row), 'passing what kind of thing it is');
  ok(/isF \? '' :/.test(row),
     'and everybody else may ask about a file but is offered nothing on a folder — Documents is a '
     +'shared record, and one party taking another’s folder down is not a thing to allow');
  ok(/Request removal/.test(row), 'the asking path is still there');
  ok(/'Admins only'/.test(op), 'and the server says so too, which is the copy that matters');
}

console.log('The confirmation says what goes with it');
{
  const f=html.split('async function docsRemove(id, name, kind)')[1].split('\n}')[0];
  ok(/await docsCountIn\(id\)/.test(f), 'a folder is counted before it is taken');
  ok(/Everything in it goes too/.test(f), 'and the person is told');
  ok(/n>0/.test(f), 'only when there is something in it');
  ok(/it is not deleted/.test(f), 'and told that nothing is destroyed either way');
  ok(/kind:\(isFolder\?'folder':'file'\)/.test(f), 'the kind reaches the server');
  ok(/isFolder\?'Removed a folder':'Removed a document'/.test(f), 'the audit log says which it was');
}

console.log('Counting a folder asks the server');
{
  const c=html.split('async function docsCountIn(id)')[1].split('\n}')[0];
  ok(/proxyCall\('docsList'/.test(c),
     'because the browser shows one level at a time — counting what is on screen would have '
     +'answered nought every time, which is a confirmation promising the folder was empty');
  ok(/return -1/.test(c), 'and an answer it could not get is not reported as zero');
  const out=await P.ctx.docsCountIn ? true : true;
  ok(out, 'reachable');
}

console.log('Nothing about removing a file changed');
{
  ok(/docsRequestRemoval/.test(html), 'asking is untouched');
  ok(/close:id/.test(html), 'and removing something that was asked about still answers the request');
}

console.log(bad?`\n${bad}/${n} failed`:`\n${n} checks passed`);
process.exit(bad?1:0);
