// What a signed-in external user can do by editing the request, not the page.
// Read paths were audited before; these are the write paths.
import fs from 'fs';
const src=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const block=(op)=>{ const i=src.indexOf("if (op === '"+op+"')");
  const j=src.indexOf("\n    if (op === '", i+10);
  return src.slice(i, j<0?src.length:j); };

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

console.log('Every write op checks where it is writing');
for(const op of ['upload','uploadToken','addVersion','appendRow','ensureFolder']){
  const b=block(op);
  ok(op+' checks the project grant',  /guardFolder\(/.test(b));
  ok(op+' checks the target folder',  /folderWritableBy\(H, t, _grants, who,/.test(b));
}

console.log('Identity is taken from the token, not the request');
const av=block('addVersion');
ok('addVersion no longer trusts body.by for external callers',
   /by: who\.isAdmin \? String\(body\.by\|\|who\.name\|\|who\.email\|\|''\) : \(who\.name \|\| who\.email \|\| ''\)/.test(av));
ok('addVersion records the caller’s own company', /co: who\.isAdmin \? String\(body\.co\|\|''\) : callerCompany/.test(av));
ok('addVersion refuses a read-only role', /!roleMayWrite\(callerRole\)\) return json/.test(av));
ok('addVersion refuses another firm’s row',
   /const rowCo = String\(row\['Company'\]/.test(av) && /rowCo !== mine\)\) return json/.test(av));
ok('and refuses a caller with no company at all', /if \(!mine \|\| \(rowCo/.test(av));
ok('an A/E may still revise any row', /seesAllCompanies\(callerRole\)/.test(av));

const ar=block('appendRow');
ok('appendRow stamps the submitter from the token', /row\[f\] = stamp;/.test(ar));
ok('appendRow stamps the submitter email',          /row\['Submitted By Email'\] = who\.email/.test(ar));
ok('appendRow still forces the private company field', /row\[pfield\] = company;/.test(ar));
ok('appendRow refuses a read-only role',            /!roleMayWrite\(normRole\(g2 && g2\.role\)\)\) return json/.test(ar));

console.log('The folder check itself');
const f=src.slice(src.indexOf('async function folderWritableBy'), src.indexOf('const reqKey ='));
ok('admins are unaffected',              /if \(who\.isAdmin\) return true;/.test(f));
ok('a read-only role cannot write',      /if \(!roleMayWrite\(role\)\) return false;/.test(f));
ok('A\/E and Owner are not company-scoped', /if \(seesAllCompanies\(role\)\) return true;/.test(f));
ok('a caller with no company cannot write', /if \(!mine\) return false;/.test(f));
ok('only the private modules are scoped',/PRIVATE_FOLDER_PREFIX\.some/.test(f));
ok('the module folder itself is allowed',/if \(!below\.length\) return true;/.test(f));
ok('the first folder below must be theirs', /below\[0\]\.trim\(\)\.toLowerCase\(\) === mine/.test(f));
ok('a lookup failure denies rather than allows', /catch\(e\)\{ return false; \}/.test(f));
ok('pay apps, daily reports and payrolls are covered',
   /PRIVATE_FOLDER_PREFIX = \['09', '13', '14'\]/.test(src));

console.log('Still closed from before');
ok('uploadText remains admin only', /if \(op === 'uploadText'\)[\s\S]{0,300}if \(!who\.isAdmin\) return json/.test(src));
ok('no op deletes a file for a non-admin', !/op === 'deleteFile'/.test(src));
ok('project deletion is admin only', /if \(op === 'deleteProject'\)[\s\S]{0,200}isAdmin/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
