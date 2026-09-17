// A contractor replacing a filed document, or promoting a pencil copy, writes
// to the payment application log. Whole-file replacement is Fidevia's alone, so
// both went out as uploadText and came back "Access denied" — after the file had
// already uploaded. The document reached Box; the row never moved.
//
// These are the server rules that make the narrow path safe, since the page's
// own checks are a courtesy to whoever is using the page.
import fs from 'fs';
const src=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const html=fs.readFileSync('index.html','utf8');
const ur=src.slice(src.indexOf("if (op === 'updateRow')"), src.indexOf("if (op === 'appendRow')"));
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

console.log('Naming the row takes more than a number');
{
  ok(/const match = \(body\.match && typeof body\.match === 'object'/.test(ur),
     'a caller may name several fields');
  ok(/: \(idField \? \{ \[idField\]: idValue \} : null\)/.test(ur),
     'falling back to the single identifier every other log uses');
  ok(/if \(!folderId \|\| !filename \|\| !match/.test(ur), 'and something has to be named');
  ok(/Object\.keys\(match\)\s*\n?\s*\.every\(k =>/.test(ur), 'every named field has to agree');
  ok(/if \(hits\.length > 1\) return json\(\{ error: 'More than one row matches/.test(ur),
     'two rows answering to one description is refused, not resolved by taking the first');
  ok(/\.trim\(\) === String\(match\[k\]/.test(ur), 'and the comparison forgives surrounding space');
}
ok(/if\(key==='pay_apps'\) match\['Contractor'\]/.test(html),
   'so the page names the contractor as well as the number — both companies have a PA #01');

console.log('What a contractor may write on a payment application');
{
  ok(/if \(filename === PAY_LOG\) ALLOWED\.add\('Copy Type'\);/.test(ur),
     'Copy Type, because promoting a pencil copy is their own act');
  ok(/if \(filename === PAY_LOG\) \{/.test(ur), 'under a rule of its own');
  ok(/if \(!payReviewer && payRowReviewed\(row\) && !payRowReturned\(row\)\)\s*\n\s*return json\(\{ error: 'Access denied' \}, 403\);/.test(ur),
     'and nothing at all once somebody has ruled on it');
  // Except the one ruling that asks for exactly this. The page relaxed the same
  // way; a server that did not would tell a contractor to revise and then
  // refuse the revision — the 403-after-upload this whole path was fixing.
  ok(/function payRowReturned\(row\) \{\s*\n\s*return \/revise\|resubmit\/i\.test/.test(src),
     'unless the ruling was revise and resubmit');
  ok(/return !payReviewStarted\(r\) \|\| payWasReturned\(r\);/.test(html),
     'which is the same relaxation the page makes, so the two cannot disagree');
  ok(/'Copy Type' in patch && String\(patch\['Copy Type'\] \|\| ''\)\.trim\(\)\.toLowerCase\(\) !== 'final'/.test(ur),
     'Copy Type may only move toward the final copy');
  ok(/'Status' in patch && !PAY_AWAITING\.test\(String\(patch\['Status'\] \|\| ''\)\)/.test(ur),
     'and the status only to one that is still waiting on Fidevia');
  ok(/\} else if \(PRIVATE_CSV\[filename\] && \('Status' in patch\)\) \{/.test(ur),
     'the other private logs keep the blanket refusal they had');
  const allowed=ur.slice(ur.indexOf('const ALLOWED'), ur.indexOf("'Assigned To']"));
  ['Approved Amount','Requested Amount','Contract Amount','Previously Paid','Reviewed By','App #','Contractor']
    .forEach(f=>ok(!allowed.includes("'"+f+"'"), 'never '+f+' — that is not the claimant’s to write'));
  ok(/if \(!seesAllCompanies\(role\)\)/.test(ur), 'and only ever on their own company’s row');
}

console.log('What counts as reviewed, on the server');
{
  const f=src.slice(src.indexOf('function payRowReviewed'), src.indexOf('// ── PROJECT ROLES'));
  ok(/if \(!row\) return true;/.test(f), 'no row is treated as reviewed, not as open season');
  ok(/Reviewed By/.test(f) && /Review Date/.test(f), 'a recorded reviewer or date');
  ok(/row\['Action'\]/.test(f), 'a recorded action');
  ok(/Signed File ID/.test(f) && /Signed File Name/.test(f), 'a signed copy');
  ok(/return !PAY_AWAITING\.test\(String\(row\['Status'\] \|\| ''\)\);/.test(f),
     'and any status that has left the waiting states');
  ok(/const PAY_AWAITING = \/awaiting\|submitted\|pending\|uploaded\/i;/.test(src),
     'which are the ones the page actually writes');
  // The same list the page uses, so the two cannot answer differently.
  const page=html.slice(html.indexOf('function payReviewStarted'), html.indexOf('function payMayReplace'));
  ['Reviewed By','Review Date','Action','Signed File ID','Signed File Name']
    .forEach(k=>ok(page.includes("'"+k+"'"), 'the page tests '+k+' too, so the two agree'));
}

console.log('Neither pay app write goes through the whole-file path any more');
{
  ok(/if \(!who\.isAdmin\) return json\(\{ error: 'Access denied' \}, 403\);/
     .test(src.slice(src.indexOf("if (op === 'uploadText')"), src.indexOf("if (op === 'updateRow')"))),
     'which is still admin-only, as it should be');
  ['submitPayFinal','submitPayReplace'].forEach(fn=>{
    const b=html.slice(html.indexOf('async function '+fn+'(){'));
    const body=b.slice(0, b.indexOf('\n}\n'));
    ok(!/boxUploadText\(/.test(body), fn+' does not rewrite the log');
    ok(/await boxUpdateRow\('pay_apps', r, (\{|_patch\))/.test(body), fn+' patches the row instead');
    ok(!/const mod=MODULES\.pay_apps, fid=/.test(body), fn+' no longer carries the handles it used for that');
  });
}

console.log((bad?'FAIL':'ok  ')+' tools-test-payrowwrite.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
