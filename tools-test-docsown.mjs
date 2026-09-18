// "Contractors/Architect/etc should be able to delete files they uploaded."
//
// Nothing knew who had. Every upload goes through the Box service account, so
// Box says Fidevia filed every document on the job — there is no ownership in
// the folder to read. It is recorded now, against the file id, which survives a
// rename and a move.
//
// Recorded as a FIRM rather than a person, because that is the unit everywhere
// else here: a review step belongs to a company, permission is matched on a
// company, and a superintendent should be able to take down what their project
// manager filed by mistake.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const proxy=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const P=bootPage('index.html'); P.run(SEED);

console.log('The record exists at all');
{
  ok(/const uploaderStore = \(\) => getStore\('doc-uploaders'\)/.test(proxy), 'there is somewhere to keep it');
  ok(/async function recordUploader\(projectId, fileId, company, email\)/.test(proxy),
     'keyed on the project and the file');
  ok(/company: String\(company \|\| ''\)\.trim\(\)/.test(proxy), 'storing the firm');
  ok(/by: String\(email \|\| ''\)\.trim\(\)/.test(proxy), 'and the person, for the audit trail');
  ok(/keys\.length > 4000/.test(proxy), 'and it is bounded rather than growing forever');
}

console.log('It is claimed once, after the file lands');
{
  const c=proxy.split("if (op === 'docsClaim')")[1].split("// Notes that belong to a file")[0];
  ok(/if \(!await guardFile\(fileId\)\)/.test(c), 'the claim is guarded like any other file call');
  ok(/if \(!pos\) return json\(\{ error: 'That file is not in Documents/.test(c),
     'and only files in Documents can be claimed');
  ok(/folderWritableBy\(H, t, _grants, who, parentId\)/.test(c),
     'the caller has to be allowed to write where the file actually is — the same test the upload '
     +'itself passed, so a claim cannot reach further than an upload could');
  ok(/if \(all\[fileId\]\) return json\(\{ ok: true, claimed: false \}\)/.test(c),
     'first claim wins — re-uploading over somebody else’s file does not make it yours');
  ok(/who\.isAdmin \? 'Fidevia'/.test(c), 'and Fidevia’s own uploads are recorded as Fidevia');
}

console.log('Why the claim is not stamped inside the upload');
{
  // A file reaches Box three ways. Stamping one of them records a third of the
  // uploads and leaves the rest ownerless, which reads as "delete does not work
  // for me" rather than as a missing record.
  const up=proxy.split("if (op === 'upload')")[1].split("if (op === 'uploadVersion')")[0];
  ok(!/recordUploader/.test(up), 'the proxy upload path does not stamp on its own');
  ok(/boxUploadDirect|boxUploadChunked/.test(html), 'because there are other paths to Box');
  const du=html.split('async function docsUpload(input)')[1].split('\n}')[0];
  ok(/if\(ent && ent\.id\) await proxyCall\('docsClaim'/.test(du),
     'so the page claims what it has just filed, whenever the upload gave it an id');
  ok(/const ent=\(up && up\.entries && up\.entries\[0\]\) \|\| up;/.test(du),
     'reading the id out of whichever shape the upload answered with');
  ok(/console\.warn\('claim:'/.test(du),
     'and a claim that fails does not fail the upload — the file is in Box either way');
}

console.log('The listing says which are yours');
{
  const l=proxy.split("if (op === 'docsList')")[1].split("if (op === 'docsRename')")[0];
  ok(/\{ yours: true \}/.test(l), 'a file the caller’s firm filed is marked');
  ok(/entries\.map\(e => \(e\.type === 'file'\s*$/m.test(l),
     'only files — a folder is never yours to take, whoever filled it');
  ok(!/uploadedBy|owners\[String\(e\.id\)\]\.by/.test(l.replace(/owners\[String\(e\.id\)\] \|\| \{\}\)\.company/g,'')),
     'and the name of whoever filed it is not handed to every party on the job');
  ok(/who\.isAdmin \? '' :/.test(l), 'Fidevia is not marked, because Fidevia can take anything anyway');
  ok(/projectId:currentProject\.folderId/.test(html.split("proxyCall('docsList',{folderId:docsHere()")[1].slice(0,120)),
     'and the page asks with the project, or there is nothing to look the owner up in');
}

console.log('Who the server lets remove what');
{
  const r=proxy.split("if (op === 'docsRemove')")[1].split("if (op === 'docsRequestRemoval')")[0];
  ok(/if \(String\(body\.kind \|\| 'file'\) === 'folder'\) \{/.test(r)
     && /Folders are Fidevia\\u2019s to remove/.test(r),
     'a folder is refused to everyone else \u2014 by the test, not only by the wording');
  ok(/mine !== owner/.test(r), 'a file is allowed only where the firm matches the record');
  ok(/if \(!mine \|\| !owner \|\| mine !== owner\)/.test(r),
     'and a file with no owner on record is not yours by default — which is every file filed '
     +'before this, so those still go through asking');
  ok(/not your firm\\u2019s to take down\. Ask Fidevia/.test(r), 'refused with what to do instead');
  ok(r.indexOf('who.isAdmin') < r.indexOf('mine !== owner'), 'Fidevia short-circuits all of it');
}

console.log('And which button the page draws');
{
  const row=html.split("+'<td class=\"nw\" style=\"text-align:right;\">'")[1].split('</td></tr>')[0];
  ok(/\(!isF && e\.yours\)/.test(row), 'your own file gets Remove');
  ok(/isF \? '' :/.test(row), 'a folder you do not own gets nothing');
  ok(/Request removal/.test(row), 'and anything else still offers the ask');
  const f=html.split('async function docsRemove(id, name, kind)')[1].split('\n}')[0];
  ok(/if\(isFolder && \(!IS_ADMIN \|\| viewingAsExternal\(\)\)\) return;/.test(f),
     'the page will not send a folder removal from anyone but Fidevia');
  ok(!/if\(!IS_ADMIN \|\| viewingAsExternal\(\)\) return;/.test(f),
     'but no longer refuses a file removal outright, which is what stopped this working');
}

console.log(bad?`\n${bad}/${n} failed`:`\n${n} checks passed`);
process.exit(bad?1:0);
